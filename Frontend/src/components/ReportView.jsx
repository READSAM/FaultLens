import { useState } from 'react'
import { COL, ML, csv, json, pdf, slug } from '../lib/analysis'
import { saveFile } from '../lib/save'
import { Bars, Beeswarm, Waterfall } from './Charts'
import DownloadMenu from './DownloadMenu'
import Recommendations from './Recommendations'
import RiskTable from './RiskTable'

const sum = (a) => a.reduce((s, x) => s + x.ef, 0)
const EXPORTS = {
  pdf: [pdf, 'application/pdf'],
  csv: [csv, 'text/csv'],
  json: [json, 'application/json'],
}

export default function ReportView({ report: r, onReanalyze, notify }) {
  const [wf, setWf] = useState(0)
  const fe = sum(r.rows.filter((x) => x.sc >= 0.5))
  const pe = sum(r.rows.filter((x) => x.sc >= 0.6))
  const kpis = [
    ['Functions analyzed', r.n],
    ['Classified fault-prone', `${r.pct}%`],
    ['P1 high priority', r.lv.High],
    ['Dominant metric', ML[r.imp[0].i], true],
    ['Effort to fix fault-prone', `${fe} h`],
    ['Effort, high risk only', `${pe} h`],
  ]
  const lvColor = { High: COL(1), Medium: COL(0.5), Low: COL(0) }

  async function download(fmt) {
    const [make, mime] = EXPORTS[fmt]
    try {
      await saveFile(`triage-${slug(r.name)}.${fmt}`, make(r), mime)
      notify('Report saved.')
    } catch (e) {
      notify(e?.code === 'declined' ? 'Download cancelled.' : 'Could not save the report.')
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">Fault<i>Lens</i></div>
        <span className="chip">{r.name}</span>
        <button className="ghost" onClick={onReanalyze}>Re-analyze</button>
      </header>

      <main className="page">
        <div className="rh">
          <div>
            <h1>Triage report</h1>
            <div className="meta">{r.name} · {r.lang} · {r.file} · {r.date}</div>
          </div>
          <DownloadMenu onPick={download} />
        </div>

        <div className="banner">
          <b>{r.fp} of {r.n} functions ({r.pct}%) are classified fault-prone.</b> Start with the {r.lv.High} P1 {r.lv.High === 1 ? 'function' : 'functions'}. The strongest overall driver is {ML[r.imp[0].i].toLowerCase()}.
        </div>

        <div className="kpis">
          {kpis.map(([label, value, small]) => (
            <div className="kpi" key={label}><span>{label}</span><b style={small ? { fontSize: 17 } : undefined}>{value}</b></div>
          ))}
        </div>

        <div className="grid3">
          <section className="panel">
            <h3>Priority distribution</h3>
            <div className="dist" role="img" aria-label={`${r.lv.High} P1, ${r.lv.Medium} P2, ${r.lv.Low} P3`}>
              {['High', 'Medium', 'Low'].map((k) => <i key={k} style={{ width: `${(r.lv[k] / r.n) * 100}%`, background: lvColor[k] }} />)}
            </div>
            <div className="lg">
              {['High', 'Medium', 'Low'].map((k, i) => (
                <span key={k}><i className="dot" style={{ background: lvColor[k] }} /><b>{r.lv[k]}</b> P{i + 1} {k}</span>
              ))}
            </div>
          </section>
          <section className="panel">
            <h3>SHAP: important features (mean impact)</h3>
            <Bars items={r.imp.map((x) => ({ label: ML[x.i], value: x.v / r.imp[0].v, color: 'var(--warm)' }))} />
          </section>
          <section className="panel">
            <h3>Riskiest files</h3>
            <Bars items={r.files.map((t) => ({ label: t[0], value: t[1], color: COL(t[1]) }))} />
          </section>
        </div>

        <div className="grid2">
          <section className="panel">
            <h3>SHAP summary: how each metric moves risk</h3>
            <Beeswarm report={r} />
            <div className="hint">Each dot is a function. Right of center raises its risk and left lowers it. Red dots have a high value of that metric.</div>
          </section>
          <section className="panel">
            <h3>SHAP waterfall: explain one function</h3>
            <select aria-label="Choose a function" value={wf} onChange={(e) => setWf(+e.target.value)}>
              {r.rows.map((x, i) => <option key={i} value={i}>{i + 1}. {x.n} ({(x.sc * 100).toFixed(0)}%)</option>)}
            </select>
            <Waterfall report={r} index={wf} />
            <div className="hint">Starts at the average risk and adds each metric’s push to reach this function’s probability.</div>
          </section>
        </div>

        <RiskTable report={r} />
        <p className="note">Amber raises a function’s risk score and teal lowers it. Scores come from models trained on public fault datasets, so use them to decide where to review first, not as a verdict. Effort figures are heuristic hours for review and fixes, so calibrate them with your own team data.</p>

        <Recommendations report={r} />
      </main>
    </>
  )
}
