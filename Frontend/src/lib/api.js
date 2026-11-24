import { buildReport, fromApi } from './analysis'

export const STAGES = ['Unpacking files', 'Extracting metrics', 'Scoring functions', 'Building summary']
const API = import.meta.env.VITE_API_URL // for example /api
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function failure(res, fallback) {
  const body = await res.json().catch(() => null)
  const detail = body?.detail
  return new Error(typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : fallback)
}

// Same form fields as the backend's POST /extract-metrics/.
function formData(form) {
  const fd = new FormData()
  fd.append('file', form.file)
  fd.append('language', form.lang) // 'cpp' or 'java'
  fd.append('build_cmds', form.lang === 'cpp' ? form.build : '')
  fd.append('filter_paths', form.exclude)
  return fd
}

// With no VITE_API_URL the app runs in demo mode with sample data.
export async function analyze(form, onStep) {
  const name = form.name.trim()
  if (!API) {
    for (let i = 0; i < STAGES.length; i++) {
      onStep(i)
      await sleep(800)
    }
    return buildReport(name, form.lang, form.file.name)
  }

  // 1. Full pipeline: POST /analyze starts a job (extraction, scoring, SHAP) and returns its id.
  onStep(0)
  const res = await fetch(`${API}/analyze`, { method: 'POST', body: formData(form) })
  if (res.status === 404 || res.status === 405) return extractOnly(form, onStep) // backend has no /analyze yet
  if (!res.ok) throw await failure(res, 'The upload failed.')
  const { jobId } = await res.json()
  for (;;) {
    await sleep(1500)
    const poll = await fetch(`${API}/analyze/${jobId}`)
    if (!poll.ok) throw await failure(poll, 'Lost contact with the server.')
    const s = await poll.json()
    if (s.status === 'error') throw new Error(s.error)
    onStep(Math.max(0, s.step - 1))
    if (s.status === 'done') return fromApi(s.result, { name, lang: form.lang, file: form.file.name })
  }
}

// 2. Today's backend: POST /extract-metrics/ runs SourceMeter and returns the metrics as a CSV (or a zip of CSVs).
async function extractOnly(form, onStep) {
  onStep(1)
  const res = await fetch(`${API}/extract-metrics/`, { method: 'POST', body: formData(form) })
  if (!res.ok) throw await failure(res, 'Metric extraction failed.')
  const blob = await res.blob()
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'metrics.csv'
  const rows = name.endsWith('.csv') ? Math.max(0, (await blob.text()).trim().split('\n').length - 1) : null
  return { metricsOnly: true, blob, name, rows, project: form.name.trim() }
}
