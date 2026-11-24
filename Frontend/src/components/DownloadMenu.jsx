import { useEffect, useRef, useState } from 'react'

const OPTIONS = [
  ['pdf', 'PDF report', 'Charts, key findings, top functions and recommendations. Best for sharing.'],
  ['csv', 'CSV spreadsheet', 'One row per function. Opens in Excel.'],
  ['json', 'JSON data', 'Everything, including SHAP values.'],
]

export default function DownloadMenu({ onPick }) {
  const [open, setOpen] = useState(false)
  const box = useRef()
  useEffect(() => {
    const close = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [])
  return (
    <div className="dlw" ref={box}>
      <button className="go inline" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>Download report</button>
      {open && (
        <div className="menu">
          {OPTIONS.map(([key, title, text]) => (
            <button key={key} onClick={() => { setOpen(false); onPick(key) }}><b>{title}</b><small>{text}</small></button>
          ))}
        </div>
      )}
    </div>
  )
}
