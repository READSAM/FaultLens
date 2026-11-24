import { Fragment, useState } from 'react'
import { CL, COL, LV, ML } from '../lib/analysis'

export default function RiskTable({ report: r }) {
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(null)
  const rows = r.rows
    .map((x, i) => [x, i])
    .filter(([x]) => (filter === 'All' || LV(x.sc) === filter) && x.n.toLowerCase().includes(query.toLowerCase()))
  return (
    <section>
      <div className="tools">
        <div className="tabs">
          {['All', 'High', 'Medium', 'Low'].map((k) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k}</button>
          ))}
        </div>
        <input type="search" placeholder="Search functions" aria-label="Search functions" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Rank</th><th>Function</th><th>Location</th><th>Probability</th><th>Risk label</th><th>Class</th><th>Effort</th><th>Top driver</th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(([x, i]) => (
              <Fragment key={i}>
                <tr>
                  <td>{i + 1}</td>
                  <td><button className="xp" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{x.n}</button></td>
                  <td>{x.f}:{x.ln}</td>
                  <td><span className="rs"><i style={{ width: `${x.sc * 100}%`, background: COL(x.sc) }} /></span>{(x.sc * 100).toFixed(1)}%</td>
                  <td><span className={`lv ${LV(x.sc)}`}>{LV(x.sc)} risk</span></td>
                  <td>{CL(x)}</td>
                  <td>{x.ef} h</td>
                  <td>{r.drv(x)}</td>
                </tr>
                {open === i && (
                  <tr className="detail">
                    <td colSpan="8">
                      <b>Why this score (SHAP)</b>
                      <div className="shap">
                        {x.sh.map((v, k) => (
                          <Fragment key={k}>
                            <span>{ML[k]}</span>
                            <span className="track"><i style={{ width: `${Math.min(100, Math.abs(v) * 250)}%`, background: v > 0 ? 'var(--warm)' : 'var(--accent)' }} /></span>
                            <em>{v > 0 ? '+' : ''}{v.toFixed(2)}</em>
                          </Fragment>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )) : <tr><td colSpan="8" className="empty">No functions match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
