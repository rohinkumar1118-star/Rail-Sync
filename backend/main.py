from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "outputs"

app = FastAPI(
    title="RAIL Sync",
    description="Backend API for the SIH AI-Powered Automatic Block Planning prototype.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://rail-sync-rhn5.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_csv(path: Path):
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path.name}")
    try:
        return pd.read_csv(path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def clean_records(df):
    df = df.copy()
    df = df.where(pd.notnull(df), None)
    return df.to_dict(orient="records")

@app.get("/")
def root():
    return {
        "message": "RAIL Sync API is running",
        "docs": "/docs",
        "status": "online"
    }

@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/tasks")
def get_tasks():
    path = OUT / "phase3_optimized_task_assignments.csv"
    if not path.exists():
        path = OUT / "optimized_task_assignments.csv"
    return clean_records(load_csv(path))

@app.get("/api/blocks")
def get_blocks():
    path = OUT / "phase3_optimized_block_plan.csv"
    if not path.exists():
        path = OUT / "optimized_block_plan.csv"
    return clean_records(load_csv(path))

@app.get("/api/windows")
def get_windows():
    return clean_records(load_csv(OUT / "phase3_feasible_windows.csv"))

@app.get("/api/priority")
def get_priority():
    return clean_records(load_csv(OUT / "priority_tasks.csv"))

@app.get("/api/assets")
def get_assets():
    return clean_records(load_csv(DATA / "assets.csv"))

@app.get("/api/trains")
def get_trains():
    return clean_records(load_csv(DATA / "train_schedule.csv"))

@app.get("/api/corridor")
def get_corridor():
    return clean_records(load_csv(DATA / "corridor_availability.csv"))

@app.get("/api/sections")
def get_sections():
    path = DATA / "sections.csv"
    if path.exists():
        df = load_csv(path)
        return clean_records(df)
    return {"sections": []}

@app.get("/api/kpis")
def get_kpis():
    tasks_path = OUT / "phase3_optimized_task_assignments.csv"
    blocks_path = OUT / "phase3_optimized_block_plan.csv"

    if not tasks_path.exists():
        tasks_path = OUT / "optimized_task_assignments.csv"
    if not blocks_path.exists():
        blocks_path = OUT / "optimized_block_plan.csv"

    tasks = load_csv(tasks_path)
    blocks = load_csv(blocks_path)

    # Be tolerant of slightly different column names.
    total_tasks = len(tasks)

    if "task_id" in tasks.columns:
        scheduled_tasks = tasks["task_id"].nunique()
    else:
        scheduled_tasks = len(tasks)

    if "utilization_pct" in blocks.columns:
        avg_utilization = float(blocks["utilization_pct"].mean())
    elif "block_utilization_pct" in blocks.columns:
        avg_utilization = float(blocks["block_utilization_pct"].mean())
    else:
        avg_utilization = 0.0

    if "severity" in tasks.columns:
        critical_scheduled = int(
            tasks["severity"].astype(str).str.lower().eq("critical").sum()
        )
    else:
        critical_scheduled = 0

    if "status" in tasks.columns:
        overdue_scheduled = int(
            tasks["status"].astype(str).str.lower().eq("overdue").sum()
        )
    else:
        overdue_scheduled = 0

    multi_department_blocks = 0
    if "departments" in blocks.columns:
        multi_department_blocks = int(
            blocks["departments"].astype(str).str.contains(",", regex=False).sum()
        )

    return {
        "scheduled_tasks": scheduled_tasks,
        "optimized_blocks": len(blocks),
        "average_block_utilization_pct": round(avg_utilization, 2),
        "critical_tasks_scheduled": critical_scheduled,
        "overdue_tasks_scheduled": overdue_scheduled,
        "multi_department_blocks": multi_department_blocks
    }

@app.get("/api/summary")
def get_summary():
    return {
        "project": "AI-Powered Automatic Block Planning",
        "department_scope": [
            "Engineering",
            "Traction Distribution",
            "Signal & Telecommunication"
        ],
        "data_sources": [
            "TMS",
            "SMMS",
            "TDMS",
            "COA"
        ],
        "optimization_engine": "OR-Tools CP-SAT",
        "phase": "Phase 4 — Backend/API"
    }

@app.get("/api/blocks/section/{section}")
def blocks_by_section(section: str):
    path = OUT / "phase3_optimized_block_plan.csv"
    if not path.exists():
        path = OUT / "optimized_block_plan.csv"
    df = load_csv(path)

    if "section" not in df.columns:
        raise HTTPException(status_code=500, detail="section column not found")

    result = df[df["section"].astype(str).str.lower() == section.lower()]
    return clean_records(result)

@app.get("/api/tasks/department/{department}")
def tasks_by_department(department: str):
    path = OUT / "phase3_optimized_task_assignments.csv"
    if not path.exists():
        path = OUT / "optimized_task_assignments.csv"
    df = load_csv(path)

    if "department" not in df.columns:
        raise HTTPException(status_code=500, detail="department column not found")

    result = df[
        df["department"].astype(str).str.lower() == department.lower()
    ]
    return clean_records(result)
