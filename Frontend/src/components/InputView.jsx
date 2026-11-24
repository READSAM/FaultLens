import { useState } from 'react'

const REFS = {
  cpp: {
    label: 'C/C++',
    exclude: '/usr/include, build/, third_party/, test/',
    cmds: [
      ['CMAKE cmd', 'rm -rf build && mkdir build && cd build && cmake -DCMAKE_CXX_COMPILER=g++ .. && make'],
      ['MAKE cmd', 'make clean || true && make'],
      ['g++ cmd', 'g++ *.cpp -o test_app'],
    ],
  },
  java: {
    label: 'Java',
    exclude: 'build/, target/, out/, test/',
    cmds: [
      ['MAVEN cmd', 'mvn -q clean compile'],
      ['GRADLE cmd', './gradlew clean build -x test'],
      ['javac cmd', 'mkdir -p out && javac -d out $(find . -name "*.java")'],
    ],
  },
}
const MAX_BYTES = 200 * 2 ** 20
const FEATURES = [
  ['Executive summary', 'Functions analyzed, percent fault-prone and the dominant metrics.'],
  ['SHAP explanations', 'See which metrics push each function’s risk up or down.'],
  ['Risk ranking', 'Probability, risk label and predicted class for every function.'],
  ['Effort and recommendations', 'A practical plan to reduce the faults, with a downloadable PDF.'],
]

export default function InputView({ form, setForm, onRun, error, notify, onBack }) {
  const [fileError, setFileError] = useState('')
  const [drag, setDrag] = useState(false)
  const refs = REFS[form.lang === 'java' ? 'java' : 'cpp']
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const isJava = form.lang === 'java'
  const needsBuild = form.lang === 'cpp' && !form.build.trim()
  const missing = [!form.name.trim() && 'a project name', !form.lang && 'a language', !form.file && 'your code as a .zip', needsBuild && 'a build command'].filter(Boolean)

  function pick(file) {
    setFileError('')
    if (!file) return
    if (!/\.zip$/i.test(file.name)) return setFileError('Only .zip files are supported. Zip your project folder and try again.')
    if (file.size > MAX_BYTES) return setFileError('That file is larger than 200 MB.')
    set('file', file)
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      notify('Command copied.')
    } catch {
      notify('Copy is blocked here. Select the command and press Ctrl+C.')
    }
  }

  return (
    <main className="split">
      <aside className="hero">
        <div className="brand">Fault<i>Lens</i></div>
        <div>
          <h1>Find the riskiest code before it ships.</h1>
          <p>Upload your project and get a ranked, explained triage report that shows where faults are most likely and how to reduce them.</p>
          <ul className="feats">
            {FEATURES.map(([title, text], i) => (
              <li key={title}>
                <b>{i + 1}</b>
                <span><strong>{title}</strong>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <small>C/C++ builds run in an isolated container with no network by default.</small>
      </aside>

      <section className="formside">
        <form className="fcard" onSubmit={(e) => { e.preventDefault(); if (!missing.length) onRun() }}>
          <button type="button" className="back" onClick={onBack}>← Back to home</button>
          <h2>Analyze your code</h2>
          <p className="hint lead">Add the details below, then run the analysis.</p>

          <div className="fld">
            <label htmlFor="pn">Project Name</label>
            <input id="pn" type="text" autoComplete="off" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          <div className="fld">
            <label htmlFor="lg">Language</label>
            <select id="lg" value={form.lang} onChange={(e) => set('lang', e.target.value)}>
              <option value="" disabled>Select language</option>
              <option value="cpp">C / C++</option>
              <option value="java">Java</option>
            </select>
          </div>

          <div className="fld">
            <label htmlFor="fl">Source code (.zip)</label>
            <label
              className={`drop${form.file ? ' ok' : ''}${drag ? ' on' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
            >
              <input id="fl" type="file" accept=".zip,application/zip" onChange={(e) => pick(e.target.files[0])} />
              {form.file ? form.file.name : 'Drop your project .zip here, or click to choose a file'}
            </label>
            {fileError && <div className="hint err">{fileError}</div>}
          </div>

          <div className="fld">
            <label htmlFor="xc">Exclude paths</label>
            <input id="xc" type="text" autoComplete="off" placeholder={`e.g. ${refs.exclude}`} value={form.exclude} onChange={(e) => set('exclude', e.target.value)} />
            <div className="hint">Optional. Comma-separated paths to skip, for example test/, build/.</div>
          </div>

          <div className="fld">
            <label htmlFor="bc">Build commands</label>
            <input id="bc" type="text" autoComplete="off" disabled={isJava} placeholder={isJava ? 'Not needed for Java' : `e.g. ${refs.cmds[2][1]}`} value={isJava ? '' : form.build} onChange={(e) => set('build', e.target.value)} />
            <div className="hint">{isJava ? 'Java projects are analyzed from source, so no build is needed.' : 'Required for C/C++. The analyzer watches this build, so it must compile and link the project.'}</div>
          </div>

          {!isJava && (
            <div className="refs">
              <b>Some references for build cmds for {refs.label}:</b>
              {refs.cmds.map(([name, cmd]) => (
                <div className="r" key={name}>
                  <code>{name} : {cmd}</code>
                  <button type="button" onClick={() => copy(cmd)}>Copy</button>
                </div>
              ))}
            </div>
          )}

          {error && <pre className="errbox" role="alert">{error}</pre>}
          <button className="go" type="submit" disabled={missing.length > 0}>Analyze</button>
          <div className="hint center-text">{missing.length ? `Add ${missing.join(', ')} to continue.` : 'Ready to analyze. Up to 200 MB, usually a few minutes.'}</div>
        </form>
      </section>
    </main>
  )
}
