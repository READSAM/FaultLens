import logging
import os
import re
import shutil
import stat
import tarfile
import tempfile
import uuid
import zipfile
from contextlib import contextmanager
from enum import Enum

import docker
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from requests.exceptions import ConnectionError as ReqConnectionError
from requests.exceptions import ReadTimeout
from starlette.background import BackgroundTask

log = logging.getLogger("sfp")

app = FastAPI(title="SFP Universal Metric Extraction Platform")
client = docker.from_env()

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
VOL_NAME = "sourcemeter-storage"
EXTRACTOR_IMAGE = "sourcemeter-extractor"

MAX_UPLOAD_BYTES = 200 * 1024 * 1024        # compressed upload size
MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024    # total size after extraction (zip-bomb guard)
MAX_ARCHIVE_MEMBERS = 50_000
ANALYZER_TIMEOUT_SEC = 30 * 60

# Sandbox for the analyzer container (it runs user-supplied build commands).
# Set ANALYZER_NETWORK=bridge if builds need to download dependencies.
ANALYZER_NETWORK = os.environ.get("ANALYZER_NETWORK", "none")
ANALYZER_USER = os.environ.get("ANALYZER_USER") or None   # e.g. "1000:1000"
ANALYZER_MEM_LIMIT = "4g"
ANALYZER_NANO_CPUS = 2_000_000_000          # 2 CPUs
ANALYZER_PIDS_LIMIT = 512

ARCHIVE_EXTS = (".tar.gz", ".tgz", ".tar", ".zip")

# C/C++ only: file written into the repo root and passed to AnalyzerCPP as
# -externalHardFilter (keeps files in the build, leaves them out of the analysis).
FILTER_FILENAME = ".sfp_hard_filter.txt"

# Shown as the example value of the build_cmds field in Swagger. It only suits
# small flat repos; real projects need their own build (make, cmake, ...).
BUILD_CMDS_EXAMPLE = "g++ *.cpp -o test_app"

ANALYZERS = {
    "cpp": "AnalyzerCPP",
    "java": "AnalyzerJava",
    "csharp": "AnalyzerCSharp",
    "python": "AnalyzerPython",
}


class Language(str, Enum):
    """Languages currently offered. This drives the dropdown in the web form and
    in /docs, and FastAPI rejects anything else with a 422.
    To re-enable C# or Python later, add `csharp = "csharp"` / `python = "python"`
    here (and an <option> in the web form); the analyzer code for them is still in place."""
    c = "c"            # analyzed with AnalyzerCPP
    cpp = "cpp"
    java = "java"


# Which results files are returned for each language.
DEFAULT_GRANULARITY = ["method"]
GRANULARITY_BY_LANGUAGE = {
    "cpp": ["function", "method"],  # C / C++ -> return file, function, and method CSVs
    "java": ["class"],                      # Java    -> *class.csv
}

# Arguments are passed positionally ($1..$5), never interpolated into the
# script text, so no user-controlled string is ever parsed by the shell.
ANALYZE_SCRIPT = r"""
set -euo pipefail
JOB="$1"; LANG_KEY="$2"; TOOL="$3"; PROJECT="$4"; FILTER_NAME="$5"
VOL_SRC="/data/uploads/$JOB"
DEST="/data/results/$JOB/$LANG_KEY"

# Run everything on the container's local filesystem. The analyzers copy files
# between the install dir (/opt), the project dir and the results dir; if these
# sit on different devices (e.g. a Docker volume vs. the container layer) boost
# fails with "Invalid cross-device link". So: copy in, analyze locally, copy out.
WORK="/tmp/work"
SRC="$WORK/src"
OUT="$WORK/results"
mkdir -p "$SRC" "$OUT" "$DEST"
cp -r "$VOL_SRC"/. "$SRC"/
cd "$SRC"
# Files written on Windows can carry CRLF line endings; a trailing CR breaks both
# the shebang of build.sh and every regex in the filter file. Strip them.
if [ -f build.sh ]; then sed -i 's/\r$//' build.sh; chmod +x build.sh; fi
if [ -f "$SRC/$FILTER_NAME" ]; then sed -i 's/\r$//' "$SRC/$FILTER_NAME"; fi

# On any failure, print the analyzer's own log files (they hold the build output
# and the real reason a task failed) plus the filter file, so the API error
# explains itself. The exit code of the script is left unchanged.
dump_logs() {
    set +e
    echo "" >&2
    echo "==== analyzer logs (last lines of each) ====" >&2
    find "$OUT" -type f -path '*/analyzer/log/*' -name '*.log' 2>/dev/null | sort | while read -r f; do
        echo "---- $f" >&2
        tail -n 40 "$f" >&2
    done
    if [ -f "$SRC/$FILTER_NAME" ]; then
        echo "---- filter file ($FILTER_NAME)" >&2
        cat "$SRC/$FILTER_NAME" >&2
    fi
    echo "---- component files the build produced ----" >&2
    find "$SRC" -name '*.component' -printf '%p (%s bytes)\n' 2>/dev/null | sort >&2
    echo "---- files that mention CMake scratch programs (cmTC_) ----" >&2
    grep -rl "cmTC_" "$OUT" "$SRC" 2>/dev/null | head -n 20 >&2
}
trap 'rc=$?; if [ "$rc" -ne 0 ]; then dump_logs; fi' EXIT

COMMON=(-projectBaseDir="$SRC" -projectName="${PROJECT}_${LANG_KEY}" -resultsDir="$OUT")
case "$LANG_KEY" in
    python)
        "$TOOL" "${COMMON[@]}"
        ;;
    java)
        # AnalyzerJava (10.x) rejects -buildScript and -gcc ("Unrecognized option");
        # it analyzes the sources under -projectBaseDir directly.
        "$TOOL" "${COMMON[@]}"
        ;;
    *)
        FILTER_ARGS=()
        if [ -f "$SRC/$FILTER_NAME" ]; then
            FILTER_ARGS=(-externalHardFilter="$SRC/$FILTER_NAME")
        fi
        # -gcc is a plain switch (wrapper mode); it does not take a path argument.
        "$TOOL" "${COMMON[@]}" ${FILTER_ARGS[@]+"${FILTER_ARGS[@]}"} -buildScript=build.sh -gcc
        ;;
esac

if [ -z "$(ls -A "$OUT")" ]; then
    echo "Analyzer produced no results" >&2
    exit 1
fi
cp -r "$OUT"/. "$DEST"/
"""


# --------------------------------------------------------------------------
# Helpers: docker
# --------------------------------------------------------------------------
def trim_logs(logs, head=2000, tail=7000):
    if len(logs) <= head + tail:
        return logs
    return logs[:head] + "\n...[truncated]...\n" + logs[-tail:]


def ensure_volume():
    try:
        client.volumes.get(VOL_NAME)
    except docker.errors.NotFound:
        client.volumes.create(VOL_NAME)


@contextmanager
def helper_container(mode="rw"):
    """Short-lived alpine container with the volume mounted; always cleaned up."""
    c = client.containers.create(
        image="alpine",
        command="tail -f /dev/null",
        volumes={VOL_NAME: {"bind": "/data", "mode": mode}},
    )
    try:
        c.start()
        yield c
    finally:
        try:
            c.remove(force=True)
        except Exception:
            log.warning("Could not remove helper container %s", c.id)


def remove_job_data(job_id):
    """Delete this job's files from the volume. job_id is hex, so it is shell-safe."""
    try:
        client.containers.run(
            image="alpine",
            command=["rm", "-rf", f"/data/uploads/{job_id}", f"/data/results/{job_id}"],
            volumes={VOL_NAME: {"bind": "/data", "mode": "rw"}},
            remove=True,
        )
    except Exception:
        log.warning("Volume cleanup failed for job %s", job_id)


# --------------------------------------------------------------------------
# Helpers: safe filesystem / archive handling
# --------------------------------------------------------------------------
def is_within(base, target):
    base = os.path.realpath(base)
    target = os.path.realpath(target)
    return os.path.commonpath([base, target]) == base


def derive_project_name(filename):
    base = os.path.basename(filename)
    lower = base.lower()
    for ext in ARCHIVE_EXTS:
        if lower.endswith(ext):
            base = base[: -len(ext)]
            break
    return re.sub(r"[^A-Za-z0-9._-]", "_", base).strip("._") or "project"


def save_upload(upload: UploadFile, dest_path):
    written = 0
    with open(dest_path, "wb") as out:
        while chunk := upload.file.read(1024 * 1024):
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Archive too large.")
            out.write(chunk)


def _safe_extract_zip(path, dest):
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        if len(infos) > MAX_ARCHIVE_MEMBERS:
            raise HTTPException(status_code=400, detail="Archive contains too many files.")
        if sum(i.file_size for i in infos) > MAX_EXTRACTED_BYTES:
            raise HTTPException(status_code=400, detail="Archive is too large when extracted.")
        for i in infos:
            if stat.S_ISLNK(i.external_attr >> 16):
                raise HTTPException(status_code=400, detail="Symlinks are not allowed in archives.")
            if not is_within(dest, os.path.join(dest, i.filename)):
                raise HTTPException(status_code=400, detail="Archive contains unsafe paths.")
        z.extractall(dest)


def _safe_extract_tar(path, dest):
    with tarfile.open(path, "r:*") as t:
        members = t.getmembers()
        if len(members) > MAX_ARCHIVE_MEMBERS:
            raise HTTPException(status_code=400, detail="Archive contains too many files.")
        if sum(m.size for m in members if m.isreg()) > MAX_EXTRACTED_BYTES:
            raise HTTPException(status_code=400, detail="Archive is too large when extracted.")
        if hasattr(tarfile, "data_filter"):
            # Python 3.12+ (and backported security releases): blocks traversal,
            # absolute paths, device files and escaping links.
            t.extractall(dest, filter="data")
        else:
            safe = []
            for m in members:
                if not (m.isreg() or m.isdir()):
                    raise HTTPException(status_code=400, detail="Links/special files are not allowed in archives.")
                if not is_within(dest, os.path.join(dest, m.name)):
                    raise HTTPException(status_code=400, detail="Archive contains unsafe paths.")
                safe.append(m)
            t.extractall(dest, members=safe)


def extract_archive_universal(archive_path, extract_to):
    try:
        if zipfile.is_zipfile(archive_path):
            _safe_extract_zip(archive_path, extract_to)
        elif tarfile.is_tarfile(archive_path):
            _safe_extract_tar(archive_path, extract_to)
        else:
            raise HTTPException(status_code=400, detail="Unsupported archive format. Upload a .zip, .tar, .tar.gz or .tgz file.")
    except (zipfile.BadZipFile, tarfile.TarError) as e:
        raise HTTPException(status_code=400, detail=f"Corrupt or unsafe archive: {e}")


_REGEX_META = re.compile(r"([.^$*+?()\[\]{}|\\])")


def normalize_build_cmds(text):
    """
    Turn the build_cmds field into a runnable bash script.
    - Line endings are normalised.
    - A script that arrives flattened onto one line with literal backslash-n
      sequences (some single-line inputs do this) is split back into lines.
      This is only done when the text starts with a #! line, because a one-line
      script that starts with #! is never valid (the whole line would be the
      interpreter path), so there is no legitimate meaning to preserve.
    - If there is no #! line, "#!/bin/bash" and "set -e" are added, so a plain
      one-liner like "mkdir -p build && cd build && cmake .. && make" just works.
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if "\n" not in text and text.startswith("#!") and "\\n" in text:
        text = text.replace("\\n", "\n")
    if not text.startswith("#!"):
        text = "#!/bin/bash\nset -e\n" + text
    return text + "\n"


def build_hard_filter(filter_paths):
    """
    Turn 'tests,third_party/lib' into an AnalyzerCPP hard-filter file. Each line
    is '-<regex>': a wrapped compiler command whose arguments match is not
    analyzed. Files stay in the build (so linking still works); they just don't
    appear in the results. The regex is wrapped in '.*' so it works whether the
    analyzer does a full match or a search.
    """
    lines = []
    for p in filter_paths.split(","):
        p = p.strip().replace("\\", "/").strip("/")
        if p.startswith("./"):
            p = p[2:]
        if not p:
            continue
        if any(c in p for c in "\r\n\0") or ".." in p.split("/"):
            raise HTTPException(status_code=400, detail=f"Invalid filter path: {p!r}")
        lines.append("-.*(^|/)" + _REGEX_META.sub(r"\\\1", p) + "(/|$).*")
    if not lines:
        raise HTTPException(status_code=400, detail="No valid filter paths given.")
    return "\n".join(lines) + "\n"


def flatten_nested_directory(base_dir):
    """
    If the archive holds a single top-level folder (ignoring __MACOSX and
    dotfiles), move its contents up. Handles my_repo/my_repo/ name collisions
    by renaming the wrapper to a unique temp name first.
    """
    macosx = os.path.join(base_dir, "__MACOSX")
    if os.path.isdir(macosx):
        shutil.rmtree(macosx)

    items = [i for i in os.listdir(base_dir) if not i.startswith(".")]
    if len(items) != 1:
        return
    wrapper = os.path.join(base_dir, items[0])
    if not os.path.isdir(wrapper) or os.path.islink(wrapper):
        return

    tmp = os.path.join(base_dir, f".flatten_{uuid.uuid4().hex}")
    os.rename(wrapper, tmp)
    for name in os.listdir(tmp):
        shutil.move(os.path.join(tmp, name), os.path.join(base_dir, name))
    os.rmdir(tmp)

# --------------------------------------------------------------------------
# Helpers: pipeline steps
# --------------------------------------------------------------------------
def upload_source_to_volume(src_dir, job_id, work_dir):
    """Copy the curated repo into the volume via put_archive (works even if the
    API itself runs in a container, unlike bind-mounting a temp path)."""
    tar_path = os.path.join(work_dir, "src.tar")
    with tarfile.open(tar_path, "w") as t:
        t.add(src_dir, arcname=".")
    with helper_container("rw") as c:
        code, out = c.exec_run(["mkdir", "-p", f"/data/uploads/{job_id}"])
        if code != 0:
            raise RuntimeError(f"mkdir failed: {out.decode(errors='replace')}")
        with open(tar_path, "rb") as f:
            c.put_archive(f"/data/uploads/{job_id}", f)
    os.remove(tar_path)


def run_analyzer(job_id, lang_key, project_name):
    tool = ANALYZERS[lang_key]
    container = client.containers.create(
        image=EXTRACTOR_IMAGE,
        command=["/bin/bash", "-c", ANALYZE_SCRIPT, "bash", job_id, lang_key, tool, project_name, FILTER_FILENAME],
        volumes={VOL_NAME: {"bind": "/data", "mode": "rw"}},
        network_mode=ANALYZER_NETWORK,
        user=ANALYZER_USER,
        mem_limit=ANALYZER_MEM_LIMIT,
        nano_cpus=ANALYZER_NANO_CPUS,
        pids_limit=ANALYZER_PIDS_LIMIT,
    )
    try:
        container.start()
        try:
            status = container.wait(timeout=ANALYZER_TIMEOUT_SEC).get("StatusCode", 1)
        except (ReadTimeout, ReqConnectionError):
            container.kill()
            raise HTTPException(status_code=504, detail=f"{tool} timed out.")
        logs = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")
        if status != 0:
            log.error("%s failed (exit %s) for job %s. Full log:\n%s", tool, status, job_id, logs)
            raise HTTPException(status_code=500, detail=f"Analysis failed for {lang_key}:\n{trim_logs(logs)}")
        return f"\n--- {tool} Logs ---\n{logs}"
    finally:
        try:
            container.remove(force=True)
        except Exception:
            log.warning("Could not remove analyzer container %s", container.id)


def download_results(job_id, work_dir):
    export_path = os.path.join(work_dir, "exported_results")
    os.makedirs(export_path, exist_ok=True)
    tar_path = os.path.join(work_dir, "results.tar")
    with helper_container("ro") as c:
        stream, _ = c.get_archive(f"/data/results/{job_id}")
        with open(tar_path, "wb") as f:
            for chunk in stream:
                f.write(chunk)
    _safe_extract_tar(tar_path, export_path)
    os.remove(tar_path)
    inner = os.path.join(export_path, job_id)
    return inner if os.path.isdir(inner) else export_path


def find_granularity_csvs(results_root, granularities):
    if isinstance(granularities, str):
        granularities = [granularities]
    found = []
    for g in granularities:
        suffix = f"{g}.csv"
        for root, _, files in os.walk(results_root):
            for f in sorted(files):
                if f.lower().endswith(suffix):
                    path = os.path.join(root, f)
                    if path not in found:
                        found.append(path)
    return sorted(found)


# --------------------------------------------------------------------------
# Endpoint (plain `def`: FastAPI runs it in a threadpool, so the blocking
# docker SDK and file I/O calls don't stall the event loop)
# --------------------------------------------------------------------------
@app.post("/extract-metrics/")
def extract_metrics(
    file: UploadFile = File(...),
    language: Language = Form(Language.cpp),  
    build_cmds: str = Form(
        "",
        description=(
            "Required for C/C++: SourceMeter analyzes the code by watching this build, so it "
            "must compile AND link something (executable or library) and exit with 0. "
            "Write it as one line joined with && (e.g. 'mkdir -p build && cd build && cmake .. && make'), (make clean || True && make) "
            "or as several lines. A #!/bin/bash line and 'set -e' are added automatically. "
            "Ignored for Java."
        ),
        examples=[BUILD_CMDS_EXAMPLE],
    ),
    filter_paths: str = Form(""),        # C/C++ only: kept in the build, left out of the analysis
):
    filename = os.path.basename(file.filename or "")
    if not filename.lower().endswith(ARCHIVE_EXTS):
        raise HTTPException(status_code=400, detail="Only .zip, .tar, .tar.gz or .tgz archives are accepted.")

    lang_key = "cpp" if language is Language.c else language.value  # C uses the C++ analyzer
    granularities = GRANULARITY_BY_LANGUAGE.get(lang_key, DEFAULT_GRANULARITY)
    if filter_paths.strip() and lang_key != "cpp":
        raise HTTPException(status_code=400, detail="filter_paths is only supported for C/C++.")
    if lang_key == "cpp" and not build_cmds.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "build_cmds is required for C/C++. SourceMeter analyzes C/C++ by watching a real build, "
                "so provide commands that compile and link the project, e.g. 'g++ *.cpp -o app' "
                "or 'make'. Join several commands with && on one line."
            ),
        )
    project_name = derive_project_name(filename)
    job_id = uuid.uuid4().hex

    ensure_volume()
    work_dir = tempfile.mkdtemp(prefix="sfp_")
    success = False

    try:
        # 1. Save + extract safely
        archive_path = os.path.join(work_dir, "upload.bin")
        save_upload(file, archive_path)

        src_dir = os.path.join(work_dir, "src")
        os.makedirs(src_dir)
        extract_archive_universal(archive_path, src_dir)
        os.remove(archive_path)
        flatten_nested_directory(src_dir)

        # build script
        if build_cmds.strip():
            with open(os.path.join(src_dir, "build.sh"), "w", newline="\n", encoding="utf-8") as f:
                f.write(normalize_build_cmds(build_cmds))
        if filter_paths.strip():
            with open(os.path.join(src_dir, FILTER_FILENAME), "w", newline="\n", encoding="utf-8") as f:
                f.write(build_hard_filter(filter_paths))

        # 3. Sync to volume, run the analyzer
        upload_source_to_volume(src_dir, job_id, work_dir)

        logs = run_analyzer(job_id, lang_key, project_name)

        # 4. Pull results back and locate CSVs
        results_root = download_results(job_id, work_dir)
        csvs = find_granularity_csvs(results_root, granularities)
        if not csvs:
            raise HTTPException(
                status_code=500,
                detail=f"Analysis completed, but no CSVs for granularities {granularities} were found. Logs:\n{trim_logs(logs)}",
            )

        # 5. Build response (single CSV, or a zip if several files matched)
        if len(csvs) == 1:
            out_path = os.path.join(work_dir, "result.csv")
            shutil.copy(csvs[0], out_path)
            out_name, media = f"{project_name}-metrics.csv", "text/csv"
        else:
            out_path = os.path.join(work_dir, "result.zip")
            with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
                for p in csvs:
                    # This forces every CSV straight to the root of the zip, no nested folders
                    z.write(p, arcname=os.path.basename(p))
            out_name, media = f"{project_name}-metrics.zip", "application/zip"

        success = True
        return FileResponse(
            out_path,
            media_type=media,
            filename=out_name,
            background=BackgroundTask(shutil.rmtree, work_dir, True),
        )

    except HTTPException:
        raise
    except Exception:
        log.exception("Pipeline error for job %s", job_id)
        raise HTTPException(status_code=500, detail="Pipeline execution error. Check server logs.")
    finally:
        remove_job_data(job_id)
        if not success:
            shutil.rmtree(work_dir, ignore_errors=True)