import { STAGES } from '../lib/api'

export default function RunningView({ step }) {
  return (
    <main className="center">
      <div className="card run">
        <h2>Analyzing your code</h2>
        <ul className="steps">
          {STAGES.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'on' : ''}>{s}</li>
          ))}
        </ul>
        <div className="pb"><i style={{ width: `${Math.min(100, (step / STAGES.length) * 100)}%` }} /></div>
        <div className="hint">This can take a few minutes while your project is built and analyzed.</div>
      </div>
    </main>
  )
}
