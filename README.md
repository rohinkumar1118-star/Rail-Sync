# 🚆 RAIL Sync — Interactive SIH Prototype

RAIL Sync is an AI-assisted railway maintenance block-planning **decision-support prototype**.

This upgraded version adds an interactive workflow on top of the existing Phase 1–5 prototype:

**Upload → Validate → Prioritize → CP-SAT Optimize → Explain → Controller Review → Approve/Hold/Reject → Monitor → Emergency Re-optimization**

> **Prototype notice:** datasets are synthetic/demo data. This project is not connected to real Indian Railways operational systems and must not be used to issue real blocks. Production deployment would require authorized railway-system integration, security, validation, audit controls and human approval.

## What was added in this upgrade

### 1. Dynamic datasets
Upload CSVs for:
- maintenance tasks
- assets
- train schedule
- corridor availability
- sections
- goods forecast

The active dataset is stored under `backend/storage/runtime/` and overrides the default demo CSV for that dataset type.

### 2. Data validation
The backend checks required columns, duplicate task IDs and missing values before optimization.

### 3. Dynamic CP-SAT optimization
The backend now runs the same core CP-SAT approach demonstrated in the notebook:
- one task can be selected at most once
- maintenance windows have capacity limits
- train-free windows are generated from corridor + train data
- priority rewards high-value tasks
- delay and separate-window penalties are applied
- tasks sharing a compatible window can form a coordinated block

### 4. Controller approval workflow
Every new recommended block starts as:
`pending_approval`

Controller can:
- Approve
- Hold
- Reject

The prototype stores these decisions in `backend/storage/state.json`.

### 5. Railway section map
A schematic section map is generated from `sections.csv`. It is intentionally a **prototype network visualization**, not a claim of live GIS railway positioning.

### 6. Emergency maintenance
A controller/maintenance user can add an emergency task. The system can then re-run optimization and produce a new plan.

### 7. Conflict checking
The backend checks the resulting maintenance assignments against train intervals.

### 8. Explainable recommendations
Each approval card shows reasons such as:
- priority-weighted selection
- train-free window
- capacity satisfied
- compatible task grouping

### 9. What-if simulation
A hypothetical additional corridor window can be tested without changing the active plan.

### 10. Audit history
Uploads, optimization runs, emergency tasks and controller decisions are recorded in a lightweight prototype audit trail.

### 11. Role-based prototype login
The UI supports Controller, Maintenance Officer and Admin roles. This is a **mock prototype access layer**, not production authentication.

## Current architecture

```text
             React + Vite + Tailwind
                      │
             FastAPI REST API
                      │
       ┌──────────────┼───────────────┐
       │              │               │
   Validation      Priority        State/Audit
       │              │               │
       └──────────────┼───────────────┘
                      │
                 OR-Tools CP-SAT
                      │
             Optimized Block Plan
                      │
          Controller Approval Queue
                      │
        Approved / Hold / Reject
                      │
             Dashboard + Map
```

## Project structure

```text
RAIL/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── services/
│   │   ├── __init__.py
│   │   └── optimizer.py
│   └── storage/
│       └── runtime/
├── data/
│   ├── assets.csv
│   ├── corridor_availability.csv
│   ├── goods_forecast.csv
│   ├── maintenance_tasks.csv
│   ├── sections.csv
│   └── train_schedule.csv
├── frontend/
│   └── src/
│       ├── main.jsx
│       └── index.css
├── notebooks/
│   └── rail_optimization.ipynb
├── optimization/
│   └── phase2_scheduler.py
├── outputs/
├── requirements.txt
├── render.yaml
└── README.md
```

## Run locally

### Backend

From the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Install:

```powershell
pip install -r requirements.txt
```

Start:

```powershell
python -m uvicorn backend.main:app --reload
```

Backend:
`http://127.0.0.1:8000`

Swagger:
`http://127.0.0.1:8000/docs`

### Frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally:
`http://localhost:5173`

For local development the frontend defaults to:
`http://127.0.0.1:8000`

For deployment set:

```text
VITE_API_URL=https://YOUR-RENDER-BACKEND.onrender.com
```

## Demo login

The login is intentionally a prototype UI layer:

```text
Controller
username: controller
password: controller123

Maintenance Officer
username: maintenance
password: maintenance123

Admin
username: admin
password: admin123
```

The current frontend does not perform server-side authentication. Do not use these credentials for production.

## Recommended SIH video flow

1. Login as Controller.
2. Show dashboard and current synthetic-data KPIs.
3. Upload a new `maintenance_tasks.csv`.
4. Show validation result.
5. Click **Generate Optimized Plan**.
6. Show changed KPIs and section utilization.
7. Open **Network Map** and click sections.
8. Open **Block Plans**.
9. Explain “Why recommended?”.
10. Open **Approvals** and Approve/Hold/Reject a block.
11. Add an emergency maintenance task.
12. Click **Re-optimize**.
13. Show changed block plan.
14. Run **What-if Simulation**.
15. Show **History** audit trail.
16. End with:
   `RAIL Sync assists railway controllers with data-driven, constraint-aware maintenance block planning; it does not autonomously issue railway blocks.`

## Real-data integration statement

The current SIH prototype uses synthetic data.

A production architecture can replace the CSV layer with authorized interfaces/data feeds from relevant railway systems such as TMS, SMMS, TDMS and COA. The integration layer would authenticate, validate, normalize and map source fields into the RAIL Sync schema before the priority and optimization engines run.

Do **not** claim live railway integration unless authorized interfaces are actually connected.

## Deployment

### Render backend

Use:

```text
Build:
pip install -r requirements.txt

Start:
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

The existing `render.yaml` can be used.

### Vercel frontend

Root directory:

```text
frontend
```

Build:

```text
npm run build
```

Output:

```text
dist
```

Environment variable:

```text
VITE_API_URL=https://YOUR-RENDER-BACKEND.onrender.com
```

### Deployment note

The prototype uses local CSV/runtime state. Render/Vercel are suitable for demonstrating the architecture, but production use should move runtime state, uploads and audit history to durable managed storage/database and implement proper authentication/authorization.

## Important technical positioning

RAIL Sync is **AI-assisted decision support / optimization**.

CP-SAT is an Operations Research constraint optimization technique, not a machine-learning model.

The current prototype demonstrates:
- data-driven task prioritization
- train-free window generation
- constraint-based scheduling
- coordinated block creation
- human approval
- dynamic re-optimization

Future production ML can add:
- asset failure prediction
- delay-impact prediction
- dynamic risk scoring

The final block recommendation should remain subject to authorized railway operational procedures and human approval.
