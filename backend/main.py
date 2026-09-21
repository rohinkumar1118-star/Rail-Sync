from __future__ import annotations

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pathlib import Path
from datetime import datetime
import json
import re
import pandas as pd

from backend.services.optimizer import optimize_data

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "outputs"
RUNTIME = ROOT / "backend" / "storage" / "runtime"
STATE_FILE = ROOT / "backend" / "storage" / "state.json"
RUNTIME.mkdir(parents=True, exist_ok=True)
OUT.mkdir(exist_ok=True)

app = FastAPI(
    title="RAIL Sync",
    description="Interactive decision-support API for the RAIL Sync AI-assisted Automatic Block Planning prototype.",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATASETS = {
    "maintenance": ("maintenance_tasks.csv", [
        "task_id","department","asset_id","section","severity","safety_critical",
        "due_date","estimated_duration_hours","status"
    ]),
    "assets": ("assets.csv", ["asset_id","department","section","importance"]),
    "trains": ("train_schedule.csv", [
        "train_id","section","date","arrival_time","departure_time"
    ]),
    "corridor": ("corridor_availability.csv", [
        "section","date","start_time","end_time","availability"
    ]),
    "sections": ("sections.csv", ["section","start_station","end_station"]),
    "forecast": ("goods_forecast.csv", ["forecast_id","section","date","expected_goods_trains"])
}

class EmergencyTask(BaseModel):
    task_id: str
    department: str = "Engineering"
    asset_id: str = ""
    section: str
    location_km: float = 0
    task_type: str = "Emergency Maintenance"
    severity: str = "Critical"
    safety_critical: str = "Yes"
    due_date: str = ""
    estimated_duration_hours: float = Field(gt=0)
    status: str = "Pending"
    reason: str = "Critical defect detected"

class SimulationRequest(BaseModel):
    section: str
    date: str
    start_time: str
    end_time: str
    scenario_name: str = "What-if scenario"

def read_state():
    if not STATE_FILE.exists():
        return {"approvals": {}, "history": [], "last_run": None}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"approvals": {}, "history": [], "last_run": None}

def write_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")

def active_path(filename: str) -> Path:
    runtime = RUNTIME / filename
    return runtime if runtime.exists() else DATA / filename

def load_csv(path: Path):
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path.name}")
    try:
        return pd.read_csv(path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read {path.name}: {e}")

def clean_records(df):
    df = df.copy().where(pd.notnull(df), None)
    return df.to_dict(orient="records")

def output_path(live_name, fallback_name):
    live = OUT / live_name
    return live if live.exists() else OUT / fallback_name

def result_frames():
    return (
        load_csv(output_path("live_optimized_task_assignments.csv",
                             "phase3_optimized_task_assignments.csv")),
        load_csv(output_path("live_optimized_block_plan.csv",
                             "phase3_optimized_block_plan.csv"))
    )

def add_history(action, detail, actor="Controller"):
    state = read_state()
    state["history"].insert(0, {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "action": action,
        "detail": detail,
        "actor": actor
    })
    state["history"] = state["history"][:100]
    write_state(state)

def validate_df(df, required):
    missing = [c for c in required if c not in df.columns]
    warnings = []
    if "task_id" in df.columns:
        dup = int(df["task_id"].duplicated().sum())
        if dup:
            warnings.append(f"{dup} duplicate task_id record(s)")
    for c in required:
        if c in df.columns:
            nulls = int(df[c].isna().sum())
            if nulls:
                warnings.append(f"{nulls} missing value(s) in {c}")
    return missing, warnings

@app.get("/")
def root():
    return {"message": "RAIL Sync API is running", "docs": "/docs", "status": "online"}

@app.get("/api/health")
def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.get("/api/tasks")
def get_tasks():
    path = output_path("live_optimized_task_assignments.csv", "phase3_optimized_task_assignments.csv")
    return clean_records(load_csv(path))

@app.get("/api/blocks")
def get_blocks():
    df = load_csv(output_path("live_optimized_block_plan.csv", "phase3_optimized_block_plan.csv"))
    state = read_state()
    approvals = state.get("approvals", {})
    if "block_id" in df.columns:
        df["approval_status"] = df["block_id"].map(approvals).fillna(df.get("approval_status", "pending_approval"))
    return clean_records(df)

@app.get("/api/windows")
def get_windows():
    return clean_records(load_csv(output_path("live_feasible_windows.csv", "phase3_feasible_windows.csv")))

@app.get("/api/priority")
def get_priority():
    return clean_records(load_csv(output_path("live_priority_tasks.csv", "priority_tasks.csv")))

@app.get("/api/assets")
def get_assets():
    return clean_records(load_csv(active_path("assets.csv")))

@app.get("/api/trains")
def get_trains():
    return clean_records(load_csv(active_path("train_schedule.csv")))

@app.get("/api/corridor")
def get_corridor():
    return clean_records(load_csv(active_path("corridor_availability.csv")))

@app.get("/api/sections")
def get_sections():
    return clean_records(load_csv(active_path("sections.csv")))

@app.get("/api/corridors")
def get_corridors():
    path = DATA / "corridor_catalog.csv"
    return clean_records(load_csv(path))

@app.get("/api/kpis")
def get_kpis():
    tasks, blocks = result_frames()
    scheduled = int((tasks["assignment_status"] == "Scheduled").sum()) if "assignment_status" in tasks else len(tasks)
    util_col = "utilization_pct" if "utilization_pct" in blocks else "block_utilization_pct"
    avg = float(blocks[util_col].mean()) if len(blocks) and util_col in blocks else 0
    scheduled_mask = tasks["assignment_status"].astype(str).eq("Scheduled") if "assignment_status" in tasks else pd.Series(True, index=tasks.index)
    critical = int(((tasks["severity"].astype(str).str.lower() == "critical") & scheduled_mask).sum()) if len(tasks) and "severity" in tasks else 0
    overdue = int(((tasks["status"].astype(str).str.lower() == "overdue") & scheduled_mask).sum()) if len(tasks) and "status" in tasks else 0
    multi = int(blocks["departments"].astype(str).str.contains(",", regex=False).sum()) if len(blocks) and "departments" in blocks else 0
    return {
        "scheduled_tasks": scheduled,
        "total_tasks": len(tasks),
        "optimized_blocks": len(blocks),
        "average_block_utilization_pct": round(avg, 2),
        "critical_tasks_scheduled": critical,
        "overdue_tasks_scheduled": overdue,
        "multi_department_blocks": multi,
    }

@app.get("/api/dashboard")
def dashboard():
    return {
        "kpis": get_kpis(),
        "dataset": {
            "maintenance": active_path("maintenance_tasks.csv").name,
            "assets": active_path("assets.csv").name,
            "trains": active_path("train_schedule.csv").name,
            "corridor": active_path("corridor_availability.csv").name
        },
        "last_run": read_state().get("last_run")
    }

@app.get("/api/summary")
def get_summary():
    return {
        "project": "RAIL Sync",
        "department_scope": ["Engineering", "Traction Distribution", "Signal & Telecommunication"],
        "data_sources": ["TMS", "SMMS", "TDMS", "COA"],
        "optimization_engine": "OR-Tools CP-SAT",
        "mode": "Human-in-the-loop decision support",
    }

@app.get("/api/blocks/section/{section}")
def blocks_by_section(section: str):
    df = load_csv(output_path("live_optimized_block_plan.csv", "phase3_optimized_block_plan.csv"))
    result = df[df["section"].astype(str).str.lower() == section.lower()]
    return clean_records(result)

@app.get("/api/tasks/department/{department}")
def tasks_by_department(department: str):
    df = load_csv(output_path("live_optimized_task_assignments.csv", "phase3_optimized_task_assignments.csv"))
    result = df[df["department"].astype(str).str.lower() == department.lower()]
    return clean_records(result)

@app.post("/api/upload")
async def upload_dataset(dataset_type: str = Form(...), file: UploadFile = File(...)):
    if dataset_type not in DATASETS:
        raise HTTPException(status_code=400, detail=f"Unknown dataset type. Use: {', '.join(DATASETS)}")
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported in this prototype.")
    content = await file.read()
    target_name, required = DATASETS[dataset_type]
    target = RUNTIME / target_name
    target.write_bytes(content)
    try:
        df = pd.read_csv(target)
    except Exception as e:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {e}")
    missing, warnings = validate_df(df, required)
    if missing:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(missing)}")
    add_history("DATASET_UPLOADED", f"{dataset_type}: {len(df)} records from {file.filename}")
    return {
        "success": True, "dataset_type": dataset_type, "filename": file.filename,
        "records": len(df), "columns": list(df.columns), "warnings": warnings,
        "valid_records": max(0, len(df) - len(warnings))
    }

@app.post("/api/validate")
def validate_datasets():
    report = {}
    for dtype, (filename, required) in DATASETS.items():
        path = active_path(filename)
        if not path.exists():
            report[dtype] = {"exists": False}
            continue
        df = load_csv(path)
        missing, warnings = validate_df(df, required)
        report[dtype] = {
            "exists": True, "records": len(df), "columns": list(df.columns),
            "missing_columns": missing, "warnings": warnings, "valid": not missing
        }
    return report

@app.post("/api/optimize")
def optimize(reason: str = "Manual optimization run"):
    try:
        tasks = load_csv(active_path("maintenance_tasks.csv"))
        assets = load_csv(active_path("assets.csv"))
        trains = load_csv(active_path("train_schedule.csv"))
        corridor = load_csv(active_path("corridor_availability.csv"))
        result = optimize_data(tasks, assets, trains, corridor, OUT, reason)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    state = read_state()
    state["approvals"] = {b: "pending_approval" for b in
                          pd.read_csv(OUT / "live_optimized_block_plan.csv")["block_id"].astype(str).tolist()}
    state["last_run"] = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "reason": reason, "result": result
    }
    write_state(state)
    add_history("OPTIMIZATION_RUN", reason)
    return {"success": True, "result": result}

@app.get("/api/approvals")
def approvals():
    blocks = load_csv(output_path("live_optimized_block_plan.csv", "phase3_optimized_block_plan.csv"))
    state = read_state()
    approvals_map = state.get("approvals", {})
    rows = []
    for r in blocks.to_dict(orient="records"):
        bid = str(r.get("block_id", ""))
        status = approvals_map.get(bid, r.get("approval_status", "pending_approval"))
        if status in ("pending_approval", "hold"):
            r["approval_status"] = status
            priority = r.get("priority", "High")
            util = r.get("utilization_pct", 0)
            r["why_recommended"] = [
                f"Priority-weighted tasks selected ({priority})",
                "Train-free corridor window",
                f"Capacity utilization at {util}%",
                "Compatible department tasks grouped where possible",
                "No infeasible train-window overlap in the generated plan"
            ]
            r["recommendation_explanation"] = "The solver balances task priority, available maintenance capacity, train movement constraints and block reuse to produce a feasible recommendation."
            rows.append(r)
    return rows

@app.post("/api/approvals/{block_id}/{action}")
def approval_action(block_id: str, action: str):
    if action not in {"approve", "hold", "reject"}:
        raise HTTPException(status_code=400, detail="Action must be approve, hold or reject.")
    blocks = load_csv(output_path("live_optimized_block_plan.csv", "phase3_optimized_block_plan.csv"))
    if block_id not in set(blocks["block_id"].astype(str)):
        raise HTTPException(status_code=404, detail="Block not found.")
    mapping = {"approve": "approved", "hold": "hold", "reject": "rejected"}
    state = read_state()
    state.setdefault("approvals", {})[block_id] = mapping[action]
    write_state(state)
    add_history(f"BLOCK_{action.upper()}", f"{block_id} {mapping[action]}")
    return {"success": True, "block_id": block_id, "approval_status": mapping[action]}

@app.post("/api/emergency")
def add_emergency(task: EmergencyTask):
    path = RUNTIME / "maintenance_tasks.csv"
    base = load_csv(active_path("maintenance_tasks.csv"))
    if task.task_id in set(base["task_id"].astype(str)):
        raise HTTPException(status_code=409, detail="Task ID already exists.")
    due = task.due_date or datetime.now().date().isoformat()
    row = task.model_dump()
    row["due_date"] = due
    updated = pd.concat([base, pd.DataFrame([row])], ignore_index=True)
    updated.to_csv(path, index=False)
    add_history("EMERGENCY_TASK_ADDED", f"{task.task_id} at {task.section}")
    return {"success": True, "task": row, "message": "Emergency task added. Run re-optimization to update the plan."}

@app.post("/api/reoptimize")
def reoptimize():
    result = optimize(reason="Emergency / dynamic re-optimization")
    return result

@app.get("/api/conflicts")
def conflicts():
    tasks, _ = result_frames()
    trains = load_csv(active_path("train_schedule.csv"))
    conflicts = []
    for _, r in tasks[tasks.get("assignment_status", pd.Series(dtype=str)).eq("Scheduled")].iterrows():
        if not r.get("date") or not r.get("block_start_time"):
            continue
        arr = tm = lambda x: int(str(x).split(":")[0]) * 60 + int(str(x).split(":")[1])
        s, e = arr(r["block_start_time"]), arr(r["block_end_time"])
        x = trains[(trains["section"].astype(str) == str(r["section"])) &
                   (trains["date"].astype(str) == str(r["date"]))]
        for _, tr in x.iterrows():
            ts, te = arr(tr["arrival_time"]), arr(tr["departure_time"])
            if max(s, ts) < min(e, te):
                conflicts.append({
                    "task_id": r["task_id"], "section": r["section"],
                    "date": r["date"], "train_id": tr["train_id"],
                    "train_time": f"{tr['arrival_time']}–{tr['departure_time']}"
                })
    return {"count": len(conflicts), "conflicts": conflicts}

@app.get("/api/map")
def map_data():
    sections = load_csv(active_path("sections.csv"))
    raw_tasks = load_csv(active_path("maintenance_tasks.csv"))
    assignments = load_csv(output_path("live_optimized_task_assignments.csv", "phase3_optimized_task_assignments.csv"))
    blocks = load_csv(output_path("live_optimized_block_plan.csv", "phase3_optimized_block_plan.csv"))
    state = read_state()
    amap = state.get("approvals", {})
    result = []
    for r in sections.to_dict(orient="records"):
        sid = str(r["section"])
        raw = raw_tasks[raw_tasks["section"].astype(str) == sid]
        st = assignments[assignments["section"].astype(str) == sid]
        sb = blocks[blocks["section"].astype(str) == sid]
        pending = int(raw["status"].astype(str).str.lower().isin(["pending", "overdue"]).sum()) if len(raw) else 0
        ongoing = int(raw["status"].astype(str).str.lower().eq("ongoing").sum()) if len(raw) else 0
        completed = int(raw["status"].astype(str).str.lower().eq("completed").sum()) if len(raw) else 0
        scheduled = int(st["assignment_status"].astype(str).eq("Scheduled").sum()) if len(st) and "assignment_status" in st else 0
        approved_blocks = [amap.get(str(b), "pending_approval") for b in sb["block_id"].astype(str)] if len(sb) else []
        if "approved" in approved_blocks:
            status = "approved"
        elif ongoing:
            status = "ongoing"
        elif pending or scheduled:
            status = "pending"
        elif completed:
            status = "completed"
        else:
            status = "available"
        result.append({
            **r,
            "status": status,
            "task_count": int(len(st)),
            "total_task_count": int(len(raw)),
            "pending_count": pending,
            "ongoing_count": ongoing,
            "completed_count": completed,
            "scheduled_count": scheduled,
            "block_count": int(len(sb)),
        })
    return result

@app.get("/api/history")
def history():
    return read_state().get("history", [])

@app.post("/api/simulation")
def simulation(req: SimulationRequest):
    if req.start_time >= req.end_time:
        raise HTTPException(status_code=400, detail="Simulation end time must be after start time.")
    tasks = load_csv(active_path("maintenance_tasks.csv"))
    assets = load_csv(active_path("assets.csv"))
    trains = load_csv(active_path("train_schedule.csv"))
    corridor = load_csv(active_path("corridor_availability.csv"))
    extra = pd.DataFrame([{
        "section": req.section, "date": req.date,
        "start_time": req.start_time, "end_time": req.end_time,
        "availability": "Available"
    }])
    simulated_corridor = pd.concat([corridor, extra], ignore_index=True)
    sim_dir = OUT / "simulation"
    result = optimize_data(tasks, assets, trains, simulated_corridor, sim_dir, req.scenario_name)
    current = get_kpis()
    result["comparison"] = {
        "scheduled_tasks_delta": int(result.get("scheduled_tasks", 0) - current["scheduled_tasks"]),
        "optimized_blocks_delta": int(result.get("optimized_blocks", 0) - current["optimized_blocks"]),
        "utilization_delta_pct": round(float(result.get("average_block_utilization_pct", 0)) - float(current["average_block_utilization_pct"]), 2)
    }
    return {"success": True, "scenario": req.model_dump(), "result": result,
            "current": current, "active_plan_unchanged": True}



def _baseline_metrics(tasks: pd.DataFrame):
    """Transparent demo baseline: one maintenance task = one independent block.
    This is a comparison baseline, not an Indian Railways performance statistic.
    """
    if tasks.empty:
        return {"blocks": 0, "utilization_pct": 0.0, "scheduled_tasks": 0}
    durations = pd.to_numeric(tasks.get("estimated_duration_hours", 0), errors="coerce").fillna(0)
    eligible = tasks.copy()
    if "status" in eligible.columns:
        eligible = eligible[~eligible["status"].astype(str).str.lower().eq("completed")]
    d = pd.to_numeric(eligible.get("estimated_duration_hours", 0), errors="coerce").fillna(0)
    blocks = len(eligible)
    util = float((d.sum() / (blocks * 3.0) * 100) if blocks else 0)
    return {"blocks": int(blocks), "utilization_pct": round(min(util, 100), 2), "scheduled_tasks": int(len(eligible))}

def _analytics_payload():
    tasks, blocks = result_frames()
    raw = load_csv(active_path("maintenance_tasks.csv"))
    sections = load_csv(active_path("sections.csv"))
    dept = raw.groupby(raw["department"].astype(str)).size().sort_values(ascending=False).to_dict() if len(raw) else {}
    status = raw["status"].astype(str).str.title().value_counts().to_dict() if len(raw) else {}
    route_map = sections.set_index("section")["display_name"].to_dict() if "display_name" in sections.columns else {}
    route_counts = raw["section"].astype(str).value_counts().head(10).to_dict() if len(raw) else {}
    route_counts = [{"route": route_map.get(k, k), "tasks": int(v)} for k,v in route_counts.items()]
    scheduled_by_dept = tasks[tasks.get("assignment_status", pd.Series(dtype=str)).astype(str).eq("Scheduled")].groupby("department").size().to_dict() if len(tasks) and "department" in tasks.columns else {}
    return {"department_load": [{"department":k,"tasks":int(v)} for k,v in dept.items()],
            "status_mix": [{"status":k,"tasks":int(v)} for k,v in status.items()],
            "route_load": route_counts,
            "scheduled_by_department": [{"department":k,"tasks":int(v)} for k,v in scheduled_by_dept.items()],
            "total_tasks": int(len(raw)), "total_blocks": int(len(blocks))}



@app.get("/api/insights")
def insights():
    tasks, blocks = result_frames()
    raw = load_csv(active_path("maintenance_tasks.csv"))
    items = []
    critical = int((raw.get("severity", pd.Series(dtype=str)).astype(str).str.lower() == "critical").sum()) if len(raw) else 0
    overdue = int((raw.get("status", pd.Series(dtype=str)).astype(str).str.lower() == "overdue").sum()) if len(raw) else 0
    if critical:
        items.append({"tone":"critical","title":"Critical maintenance attention","text":f"{critical} critical task(s) are present in the active maintenance dataset."})
    if overdue:
        items.append({"tone":"warning","title":"Overdue work detected","text":f"{overdue} task(s) are marked overdue and should be reviewed by the responsible officer."})
    if len(blocks):
        multi = int(blocks.get("departments", pd.Series(dtype=str)).astype(str).str.contains(",", regex=False).sum())
        if multi:
            items.append({"tone":"positive","title":"Cross-department grouping opportunity","text":f"{multi} optimized block(s) contain tasks from multiple departments."})
        top = blocks.groupby("section").size().sort_values(ascending=False).index[0]
        sec = load_csv(active_path("sections.csv"))
        label = sec.set_index("section").get("display_name", pd.Series()).get(top, top) if len(sec) else top
        items.append({"tone":"info","title":"Highest block concentration","text":f"{label} currently has the highest number of generated maintenance blocks."})
    if not items:
        items.append({"tone":"info","title":"Network stable","text":"No additional high-priority insight was detected from the current synthetic dataset."})
    return {"insights": items[:6], "generated_from":"Synthetic/demo data"}

@app.get("/api/analytics")
def analytics():
    return _analytics_payload()

@app.get("/api/baseline")
def baseline():
    raw = load_csv(active_path("maintenance_tasks.csv"))
    current = get_kpis()
    base = _baseline_metrics(raw)
    return {"baseline": base, "optimized": {"blocks": current["optimized_blocks"], "utilization_pct": current["average_block_utilization_pct"], "scheduled_tasks": current["scheduled_tasks"]}, "note":"Baseline is a transparent synthetic comparison: each eligible task is treated as an independent maintenance block."}

def _legacy_kpi_compat():
    return get_kpis()
