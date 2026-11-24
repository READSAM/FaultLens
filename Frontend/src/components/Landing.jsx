import { useMemo } from 'react'
import { buildReport, COL, LV } from '../lib/analysis'
import { Beeswarm, Waterfall } from './Charts'

const PATHS = {
  lock: 'M6 10V8a6 6 0 1 1 12 0v2M5 10h14v10H5z',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  down: 'M12 4v11m0 0l-4-4m4 4l4-4M5 19h14',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  list: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  again: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
}
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>
)

const TRUST = [['lock', 'Builds run in an isolated sandbox'], ['code', 'C/C++ and Java'], ['clock', 'Results in a few minutes'], ['down', 'PDF, CSV and JSON export']]
const STEPS = [
  ['Upload your project', 'Zip the folder, choose C/C++ or Java, add a build command for C/C++, and list any paths to skip.'],
  ['We measure and score', 'Size and complexity are measured for every function, then a trained model scores each one.'],
  ['Fix the right things first', 'Get a ranked report with SHAP explanations, effort estimates and a refactoring plan.'],
]
const FEATURES = [
  ['chart', 'Risk ranking', 'Every function gets a probability, a risk label and a predicted class, ranked from most to least likely to fail.'],
  ['layers', 'SHAP explanations', 'See which metrics push risk up or down, for the whole project and for any single function.'],
  ['clock', 'Effort estimates', 'Rough hours to review and fix each function, so the work can be planned.'],
  ['list', 'Recommendations', 'A concrete refactoring plan with the projected risk after each fix, plus checks to stop new faults.'],
  ['down', 'Shareable reports', 'Download a multi-page PDF, a CSV for your tracker, or JSON for your own tools.'],
  ['again', 'Re-analyze anytime', 'Fix the code, upload it again and confirm the risk has gone down.'],
]
const FAQ = [
  ['Is my code executed?', 'C/C++ projects are compiled with your build command inside an isolated container that has no network access by default and strict CPU, memory and time limits. Java projects are analyzed from source without a build.'],
  ['Which languages are supported?', 'C/C++ and Java today. Upload the project as a .zip of up to 200 MB. C/C++ also needs a build command.'],
  ['How long does an analysis take?', 'Usually a few minutes. C/C++ projects are built first, so large projects take longer.'],
  ['What do the scores mean?', 'Each score is a probability from a model trained on public fault datasets. Use it to decide where to review first, not as a verdict on any function.'],
]

export default function Landing({ onStart, onSample }) {
  const r = useMemo(() => buildReport('Payments service', 'cpp', 'payments.zip'), [])
  const top = r.rows.slice(0, 5)
  return (
    <div className="l">
      <header className="lnav">
        <div className="brand">Fault<i>Lens</i></div>
        <nav aria-label="Sections">
          <a href="#how">How it works</a><a href="#features">Features</a><a href="#sample">Sample</a><a href="#faq">FAQ</a>
        </nav>
        <button className="go inline" onClick={onStart}>Analyze code</button>
      </header>

      <section className="lhero">
        <div className="lhero-in">
          <div>
            <span className="pill"><b>NEW</b> Fault prediction for C/C++ and Java</span>
            <h1>Know which functions will break <em>before your users do.</em></h1>
            <p className="lead2">Upload your repository as a .zip. FaultLens scores every function for fault risk, explains why with SHAP, estimates the effort to fix it and tells you what to refactor first.</p>
            <div className="cta">
              <button className="go inline big" onClick={onStart}>Analyze your code →</button>
              <button className="btn2" onClick={onSample}>See a sample report</button>
            </div>
          </div>

          <div className="mockwrap" aria-hidden="true">
            <div className="mock">
              <div className="mock-bar"><i /><i /><i /><span>Triage report · {r.name}</span></div>
              <div className="mock-body">
                <div className="mini-kpis">
                  <div><span>Functions</span><b>{r.n}</b></div>
                  <div><span>Fault-prone</span><b>{r.pct}%</b></div>
                  <div><span>High risk</span><b>{r.lv.High}</b></div>
                </div>
                <ul className="mini-rank">
                  {top.map((x, i) => (
                    <li key={x.n}>
                      <em>{i + 1}</em><span>{x.n}</span>
                      <span className="rs"><i style={{ width: `${x.sc * 100}%`, background: COL(x.sc) }} /></span>
                      <b>{(x.sc * 100).toFixed(0)}%</b>
                      <span className={`lv ${LV(x.sc)}`}>{LV(x.sc)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="float f1"><span>Effort to fix</span><b>{top[0].ef} h</b></div>
            <div className="float f2"><span>Top driver</span><b>{r.drv(top[0])}</b></div>
          </div>
        </div>
      </section>

      <section className="trust">
        {TRUST.map(([icon, text]) => <div key={text}><Icon name={icon} />{text}</div>)}
      </section>

      <section className="lsec" id="how">
        <h2>From zip file to action plan in three steps</h2>
        <div className="steps3">
          {STEPS.map(([title, text], i) => (
            <div className="step3" key={title}><b>{i + 1}</b><h3>{title}</h3><p>{text}</p></div>
          ))}
        </div>
      </section>

      <section className="lsec tint" id="features">
        <h2>Everything you need to triage risky code</h2>
        <div className="fgrid">
          {FEATURES.map(([icon, title, text]) => (
            <div className="fcell" key={title}><span className="ico"><Icon name={icon} /></span><h3>{title}</h3><p>{text}</p></div>
          ))}
        </div>
      </section>

      <section className="lsec" id="sample">
        <h2>See why each function is risky</h2>
        <p className="lsub">Every score comes with a SHAP explanation. These charts come from the sample report.</p>
        <div className="sgrid">
          <div className="panel"><h3>Summary: how each metric moves risk</h3><Beeswarm report={r} /></div>
          <div className="panel"><h3>Waterfall: why {top[0].n} scores {(top[0].sc * 100).toFixed(0)}%</h3><Waterfall report={r} index={0} /></div>
        </div>
        <div className="cta mid"><button className="go inline big" onClick={onSample}>Open the full sample report</button></div>
      </section>

      <section className="lsec narrow tint" id="faq">
        <h2>Questions</h2>
        {FAQ.map(([q, a]) => (
          <details key={q}><summary>{q}</summary><p>{a}</p></details>
        ))}
      </section>

      <section className="final">
        <h2>Ready to find your riskiest functions?</h2>
        <p>Upload a project and get your triage report in minutes.</p>
        <button className="go inline big" onClick={onStart}>Analyze your code →</button>
      </section>
      <footer className="lfoot"><div className="brand">Fault<i>Lens</i></div><span>Software fault prediction. Scores are a prioritization aid, not a verdict.</span></footer>
    </div>
  )
}
