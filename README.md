# FaultLens

A web interface that analyses your repo to predict risky modules and produce a triage report.

```
Backend/    FastAPI service: runs SourceMeter in Docker and returns code metrics (POST /extract-metrics/)
Frontend/   React + Vite app: landing page, input form, triage report with SHAP plots, recommendations and PDF/CSV/JSON export
```

## Run the backend
Needs Docker running and the SourceMeter archive next to the Dockerfile (it is git-ignored because of its licence).

    cd Backend
    docker build -t sourcemeter-extractor .
    pip install fastapi uvicorn python-multipart docker
    uvicorn main:app --reload --port 8000        # API docs at http://localhost:8000/docs

## Run the frontend
    cd Frontend
    npm install
    cp .env.example .env      # VITE_API_URL=/api  (the dev server proxies /api to http://localhost:8000)
    npm run dev               # http://localhost:5173

Without `VITE_API_URL` the frontend runs in demo mode with sample data. See `Frontend/README.md` for details.
