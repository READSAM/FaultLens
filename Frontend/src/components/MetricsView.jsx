import { saveFile } from '../lib/save'

// Shown when the backend only offers metric extraction (no /analyze endpoint yet).
export default function MetricsView({ result, onBack, notify }) {
  async function download() {
    try {
      await saveFile(result.name, result.blob, result.blob.type || 'application/octet-stream')
      notify('Metrics saved.')
    } catch {
      notify('Could not save the file.')
    }
  }
  return (
    <main className="center">
      <div className="card run">
        <h2>Metrics extracted</h2>
        <p className="hint">{result.project}: SourceMeter finished.{result.rows != null && ` ${result.rows} rows of metrics.`}</p>
        <p>The backend returned code metrics only. Risk scores, SHAP plots and the triage report appear once the backend has an <code>/analyze</code> endpoint that scores these metrics with the trained model.</p>
        <button className="go" onClick={download}>Download {result.name}</button>
        <button className="ghost" style={{ margin: '12px 0 0', width: '100%' }} onClick={onBack}>Analyze another project</button>
      </div>
    </main>
  )
}
