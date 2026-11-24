import { recData } from '../lib/analysis'

export default function Recommendations({ report: r }) {
  const d = recData(r)
  return (
    <section className="panel recs">
      <h2>Recommendations</h2>
      <p className="hint">How to reduce the faults found in {r.name}.</p>
      <div className="banner ok">{d.sum}</div>
      {d.rows.length > 0 && (
        <>
          <h3>1. Refactor the highest-risk functions</h3>
          <div className="scroll">
            <table style={{ minWidth: 640 }}>
              <thead><tr><th>Function</th><th>Problem</th><th>Action</th><th>Risk now → after</th><th>Effort</th></tr></thead>
              <tbody>
                {d.rows.map((a) => (
                  <tr key={a.n}>
                    <td>{a.n}<br /><span className="hint">{a.loc}</span></td>
                    <td>{a.why}</td>
                    <td>{a.act}</td>
                    <td>{Math.round(a.p0 * 100)}% → {Math.round(a.p1 * 100)}%</td>
                    <td>{a.ef} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="cols">
        <div><h3>2. Prevent new faults</h3><ul>{d.prev.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div><h3>3. Test and verify</h3><ul>{d.tests.map((t) => <li key={t}>{t}</li>)}</ul></div>
      </div>
    </section>
  )
}
