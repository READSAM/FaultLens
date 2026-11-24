import { useCallback, useRef, useState } from 'react'
import InputView from './components/InputView'
import RunningView from './components/RunningView'
import ReportView from './components/ReportView'
import Landing from './components/Landing'
import MetricsView from './components/MetricsView'
import { buildReport } from './lib/analysis'
import { analyze } from './lib/api'

export default function App() {
  const [view, setView] = useState('landing') // landing | input | running | report | metrics
  const [form, setForm] = useState({ name: '', lang: '', file: null, exclude: '', build: '' })
  const [step, setStep] = useState(0)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const timer = useRef()

  const notify = useCallback((msg) => {
    setToast(msg)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  function openSample() {
    setReport(buildReport('Sample project', 'cpp', 'sample-project.zip'))
    setView('report')
  }

  async function run() {
    setError('')
    setStep(0)
    setView('running')
    try {
      const out = await analyze(form, setStep)
      setReport(out)
      setView(out.metricsOnly ? 'metrics' : 'report')
    } catch (e) {
      setError(e.message || 'The analysis failed.')
      setView('input')
    }
  }

  return (
    <>
      {view === 'landing' && <Landing onStart={() => setView('input')} onSample={openSample} />}
      {view === 'input' && <InputView form={form} setForm={setForm} onRun={run} error={error} notify={notify} onBack={() => setView('landing')} />}
      {view === 'running' && <RunningView step={step} />}
      {view === 'metrics' && <MetricsView result={report} onBack={() => setView('input')} notify={notify} />}
      {view === 'report' && <ReportView report={report} onReanalyze={() => setView('input')} notify={notify} />}
      <div className={`toast${toast ? ' on' : ''}`} role="status">{toast}</div>
    </>
  )
}
