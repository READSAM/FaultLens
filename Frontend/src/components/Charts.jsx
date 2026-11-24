import { BASE, COL, ML } from '../lib/analysis'

export function Bars({ items }) {
  return items.map((it) => (
    <div className="br" key={it.label}>
      <span title={it.label}>{it.label}</span>
      <span className="track"><i style={{ width: `${it.value * 100}%`, background: it.color }} /></span>
    </div>
  ))
}

export function Beeswarm({ report: r }) {
  const mx = Math.max(...r.rows.flatMap((x) => x.sh.map(Math.abs)), 0.01)
  const x0 = 170, w = 320, H = r.imp.length * 40 + 56
  return (
    <svg className="sv" viewBox={`0 0 520 ${H}`} role="img" aria-label="SHAP summary plot">
      <defs><linearGradient id="gr"><stop offset="0" stopColor="#2F6FD6" /><stop offset="1" stopColor="#D93C42" /></linearGradient></defs>
      <line className="zero" x1={x0 + w / 2} y1="8" x2={x0 + w / 2} y2={H - 48} />
      {r.imp.map((q, k) => {
        const y = 28 + k * 40, vs = r.rows.map((z) => z.m[q.i]), lo = Math.min(...vs), hi = Math.max(...vs)
        return (
          <g key={q.i}>
            <text x="0" y={y + 4}>{ML[q.i]}</text>
            <line className="ax" x1={x0} y1={y} x2={x0 + w} y2={y} />
            {r.rows.map((z, j) => {
              const t = hi > lo ? (z.m[q.i] - lo) / (hi - lo) : 0.5
              return (
                <circle key={j} cx={x0 + w / 2 + (z.sh[q.i] / mx) * (w / 2 - 8)} cy={y + ((j * 7) % 5 - 2) * 3.5} r="4.5" fillOpacity=".9"
                  fill={`rgb(${Math.round(47 + 170 * t)},${Math.round(111 - 51 * t)},${Math.round(214 - 148 * t)})`}>
                  <title>{`${z.n}: ${z.sh[q.i] > 0 ? '+' : ''}${z.sh[q.i].toFixed(2)}`}</title>
                </circle>
              )
            })}
          </g>
        )
      })}
      <text x={x0} y={H - 30}>Lowers risk</text>
      <text x={x0 + w} y={H - 30} textAnchor="end">Raises risk</text>
      <rect x={x0 + w / 2 - 60} y={H - 16} width="120" height="8" rx="4" fill="url(#gr)" />
      <text x={x0 + w / 2 - 66} y={H - 8} textAnchor="end">Low value</text>
      <text x={x0 + w / 2 + 66} y={H - 8}>High value</text>
    </svg>
  )
}

export function Waterfall({ report: r, index }) {
  const t = r.rows[index]
  const ord = t.sh.map((v, i) => [v, i]).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))
  const rest = t.sc - (BASE + t.sh.reduce((a, b) => a + b, 0))
  const steps = [...ord.map((a) => [`${ML[a[1]]} = ${t.m[a[1]]}`, a[0]]), ['Other factors', rest]]
  let c = BASE
  const pts = steps.map((s) => { const a = c; c += s[1]; return [a, c] })
  const all = [BASE, t.sc, ...pts.flat()]
  const lo = Math.min(0, ...all), hi = Math.max(...all), x0 = 185, w = 250
  const px = (v) => x0 + ((v - lo) / (hi - lo)) * w
  const rows = [
    ['Base value (average function)', BASE, 0, BASE, 'var(--line)'],
    ...steps.map((s, i) => [s[0], s[1], pts[i][0], pts[i][1], s[1] >= 0 ? 'var(--warm)' : 'var(--accent)']),
    ['Predicted probability', t.sc, 0, t.sc, COL(t.sc)],
  ]
  return (
    <svg className="sv" viewBox={`0 0 520 ${rows.length * 28 + 12}`} role="img" aria-label={`SHAP waterfall for ${t.n}`}>
      {rows.map((q, i) => {
        const y = 6 + i * 28, a = px(Math.min(q[2], q[3])), b = px(Math.max(q[2], q[3]))
        return (
          <g key={i}>
            <text x="0" y={y + 15}>{q[0]}</text>
            <rect x={a} y={y + 4} width={Math.max(b - a, 1.5)} height="14" rx="2" style={{ fill: q[4] }} />
            <text className="vl" x={b + 5} y={y + 15}>{i && i < rows.length - 1 && q[1] >= 0 ? '+' : ''}{q[1].toFixed(2)}</text>
          </g>
        )
      })}
    </svg>
  )
}
