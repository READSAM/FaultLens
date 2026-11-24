# FaultLens frontend (React + Vite)

Upload a project .zip, get a ranked and explained fault-risk triage report with SHAP plots, effort estimates, recommendations and a downloadable PDF, CSV or JSON.

## Run
    npm install
    npm run dev          # http://localhost:5173, demo mode with sample data
    npm run build        # production build in dist/

## Connect the backend (Backend/ in this repo)
    cp .env.example .env     # VITE_API_URL=/api, forwarded to http://localhost:8000 by the Vite dev proxy
    npm run dev
For a deployed backend, set `VITE_API_URL` to its full URL and set `CORS_ORIGINS` on the backend to the frontend URL.

The form posts the same fields as the backend's `POST /extract-metrics/`: `file`, `language` (`cpp` or `java`), `build_cmds` (C/C++ only) and `filter_paths` (the exclude paths, both languages).

- If the backend has a `POST /analyze` job endpoint, the app polls `GET /analyze/{id}` and shows the full triage report (the JSON shape is mapped by `fromApi()` in `src/lib/analysis.js`).
- Until then, it falls back to `/extract-metrics/` and shows a "Metrics extracted" screen with the CSV or zip for download.

## Structure
    src/App.jsx                      view state: input, running, report
    src/lib/api.js                   demo mode and real API client
    src/lib/analysis.js              sample-data generator, effort and recommendation rules, CSV/JSON/PDF exporters, API mapping
    src/lib/save.js                  file download helper
    src/components/InputView.jsx     full-page split layout and the input form
    src/components/RunningView.jsx   stage progress
    src/components/ReportView.jsx    the triage report page
    src/components/Charts.jsx        bars, SHAP summary plot, SHAP waterfall
    src/components/RiskTable.jsx     ranking table with filters and SHAP detail
    src/components/Recommendations.jsx
    src/components/DownloadMenu.jsx
    src/components/Landing.jsx       landing page
    src/components/MetricsView.jsx   metrics-only result screen

## Notes
- Demo mode values are generated, not real model output. `fromApi()` uses the real SHAP values and probabilities from the backend.
- `fromApi()` expects the metric names `loc, cc, h_volume, h_difficulty, h_effort` in `modules[].metrics` and `modules[].shap`. With SourceMeter output, map your trained model's feature names in `BK` inside `src/lib/analysis.js`.
- src/components/MetricsView.jsx is the temporary screen shown while only `/extract-metrics/` exists.
