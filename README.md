# 🚆 RAIL — AI-Powered Automatic Block Planning

SIH prototype for **automatic railway maintenance block planning** using maintenance priority, train/corridor constraints and OR-Tools CP-SAT optimization.

> **Prototype notice:** The included datasets are synthetic/demo data. This project is for SIH demonstration and decision-support research only. It is not connected to real Indian Railways operational systems and must not be used to issue real blocks without authorized integration, validation, security controls and human approval.

## Problem

Maintenance work across Engineering, Traction Distribution, and Signal & Telecommunication can be planned separately, while maintenance/defect information, train schedules and corridor availability may live in different systems. Manual coordination can lead to fragmented blocks, avoidable conflicts and inefficient use of available maintenance windows.

## Proposed solution

RAIL combines prototype data representing:

- Maintenance and defect tasks
- Asset criticality/importance
- Train schedules
- Corridor availability
- Goods/train forecast information

The pipeline then:

1. Scores maintenance tasks by severity, safety, asset importance, urgency and overdue status.
2. Finds train-free portions of available corridor windows.
3. Produces a greedy baseline schedule.
4. Uses **OR-Tools CP-SAT** to select high-value task/window assignments under capacity constraints.
5. Groups tasks into coordinated blocks across departments.
6. Exposes the optimized results through FastAPI.
7. Displays KPIs and block plans in a React dashboard.

## Final project structure

```text
RAIL/
├── backend/
│   ├── main.py
│   └── requirements.txt
│
├── data/
│   ├── assets.csv
│   ├── corridor_availability.csv
│   ├── goods_forecast.csv
│   ├── maintenance_tasks.csv
│   ├── sections.csv
│   └── train_schedule.csv
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── notebooks/
│   └── rail_optimization.ipynb
│
├── optimization/
│   └── phase2_scheduler.py
│
├── outputs/
│   └── README.md
│
├── requirements.txt
├── render.yaml
├── start_backend.bat
├── start_frontend.bat
└── README.md
```

## Tech stack

**Python:** Pandas, NumPy, Matplotlib, scikit-learn, OR-Tools

**Backend:** FastAPI + Uvicorn

**Frontend:** React + Vite + Tailwind CSS + Recharts + Lucide React

**Optimization:** OR-Tools CP-SAT

## Run locally

### 1. Create/activate Python environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, you can use:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### 2. Install Python dependencies

From the project root:

```powershell
pip install -r requirements.txt
```

### 3. Run the final notebook

Open:

```text
notebooks/rail_optimization.ipynb
```

Run all cells from top to bottom. It generates the CSV outputs used by the backend.

### 4. Start backend

From the project root:

```powershell
python -m uvicorn backend.main:app --reload
```

Backend:
`http://127.0.0.1:8000`

Swagger:
`http://127.0.0.1:8000/docs`

### 5. Start frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.

The frontend reads the API URL from `VITE_API_URL`. For local development, copy `frontend/.env.example` to `frontend/.env` if desired.

## Backend endpoints

```text
GET /
GET /api/health
GET /api/summary
GET /api/kpis
GET /api/tasks
GET /api/priority
GET /api/blocks
GET /api/windows
GET /api/assets
GET /api/trains
GET /api/corridor
GET /api/sections
GET /api/blocks/section/{section}
GET /api/tasks/department/{department}
```

## Deployment

### Backend — Render

This repository includes `render.yaml`. On Render, create a Python web service from the GitHub repository. The service can use:

```text
Build: pip install -r requirements.txt
Start: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

After deployment, copy the Render backend URL.

### Frontend — Vercel

Import the GitHub repository into Vercel and set the root directory to:

```text
frontend
```

Build command:

```text
npm run build
```

Output directory:

```text
dist
```

Add this environment variable in Vercel:

```text
VITE_API_URL=https://YOUR-RENDER-BACKEND.onrender.com
```

Redeploy the frontend after setting the variable.

## SIH demo flow

1. Explain the problem: decentralized maintenance planning.
2. Show the synthetic input datasets.
3. Show task priority scoring.
4. Show train-free feasible windows.
5. Compare greedy planning with CP-SAT optimization.
6. Open the FastAPI Swagger page to demonstrate the API layer.
7. Open the React dashboard to show optimized blocks, utilization and critical/overdue work.
8. Explain future integration with authorized TMS/SMMS/TDMS/COA data and human approval workflows.

## Why this is an AI/optimization prototype

The prototype uses data-driven prioritization plus mathematical optimization. The CP-SAT model selects feasible maintenance assignments while balancing task priority, delay penalties and the number of active windows. This is best presented as **AI-assisted optimization / decision support**, not as an autonomous railway control system.

## Future scope

- Real authorized railway-system integrations
- Live timetable and possession/block feeds
- Weather and incident constraints
- Asset failure prediction
- Multi-objective optimization for punctuality, safety and maintenance cost
- Human approval and audit trail
- Role-based access control
- Historical KPI monitoring and before/after analytics
- Secure cloud deployment and monitoring

## License

Academic/SIH prototype. Add your team's preferred license before public production use.
