from __future__ import annotations

from pathlib import Path
from typing import Optional
import pandas as pd
import numpy as np
from ortools.sat.python import cp_model

SEV = {"Critical": 10, "High": 7, "Medium": 5, "Low": 2}
SAFE = {"Yes": 10, "No": 3}
IMP = {"High": 10, "Medium": 6, "Low": 3}

def tm(value):
    h, m = map(int, str(value).split(":")[:2])
    return h * 60 + m

def to_time(value):
    value = int(round(value))
    return f"{value // 60:02d}:{value % 60:02d}"

def _priority(tasks: pd.DataFrame, assets: pd.DataFrame, reference_date: pd.Timestamp) -> pd.DataFrame:
    x = tasks.copy()
    if "status" in x.columns:
        x = x[x["status"].astype(str).str.lower().isin(["pending", "overdue", "ongoing"])].copy()
    x["due_date"] = pd.to_datetime(x["due_date"], errors="coerce")
    x["days_until_due"] = (x["due_date"] - reference_date).dt.days.fillna(30)
    x["urgency_score"] = np.clip(10 - x["days_until_due"].clip(-10, 10), 0, 20)
    x["severity_score"] = x["severity"].map(SEV).fillna(2)
    x["safety_score"] = x["safety_critical"].map(SAFE).fillna(3)
    if "importance" not in x.columns:
        x["importance"] = "Medium"
    x = x.merge(assets[["asset_id", "importance"]], on="asset_id", how="left", suffixes=("", "_asset"))
    x["importance"] = x["importance_asset"].fillna(x["importance"])
    x.drop(columns=["importance_asset"], inplace=True, errors="ignore")
    x["asset_importance_score"] = x["importance"].map(IMP).fillna(6)
    if "is_emergency" not in x.columns:
        x["is_emergency"] = False
    emergency_mask = x["is_emergency"].astype(str).str.lower().isin(["true", "yes", "1"])
    emergency_bonus = np.where(emergency_mask, 1000, 0)
    overdue_bonus = np.where(x["status"].astype(str).str.lower().eq("overdue"), 10, 0)
    x["priority_score"] = (
        x["severity_score"] * 3.5
        + x["safety_score"] * 2.5
        + x["asset_importance_score"] * 1.5
        + x["urgency_score"] * 1.5
        + overdue_bonus
        + emergency_bonus
    )
    return x.sort_values("priority_score", ascending=False).reset_index(drop=True)

def _free_windows(corridor: pd.DataFrame, trains: pd.DataFrame):
    c = corridor.copy()
    t = trains.copy()
    c["start_min"] = c["start_time"].map(tm)
    c["end_min"] = c["end_time"].map(tm)
    t["arrival_min"] = t["arrival_time"].map(tm)
    t["departure_min"] = t["departure_time"].map(tm)

    rows = []
    for section in sorted(c["section"].dropna().astype(str).unique()):
        for date in sorted(c.loc[c["section"].astype(str).eq(section), "date"].astype(str).unique()):
            available = c[
                c["section"].astype(str).eq(section)
                & c["date"].astype(str).eq(date)
                & c["availability"].astype(str).str.lower().eq("available")
            ]
            section_trains = t[
                t["section"].astype(str).eq(section) & t["date"].astype(str).eq(date)
            ][["arrival_min", "departure_min"]].sort_values("arrival_min").values.tolist()

            for row in available.itertuples(index=False):
                start, end = int(row.start_min), int(row.end_min)
                current = start
                for arr, dep in section_trains:
                    arr, dep = int(arr), int(dep)
                    if dep <= current:
                        continue
                    if arr >= end:
                        break
                    if arr > current:
                        rows.append((section, date, current, min(arr, end)))
                    current = max(current, dep)
                    if current >= end:
                        break
                if current < end:
                    rows.append((section, date, current, end))

    return [
        {"window_id": f"W{i+1:04d}", "section": s, "date": d,
         "start_min": a, "end_min": b, "capacity_min": b-a}
        for i, (s, d, a, b) in enumerate(rows) if b > a
    ]

def optimize_data(tasks: pd.DataFrame, assets: pd.DataFrame,
                  trains: pd.DataFrame, corridor: pd.DataFrame,
                  output_dir: Path, reason: str = "Initial optimization") -> dict:
    required = ["task_id", "department", "asset_id", "section", "severity",
                "safety_critical", "due_date", "estimated_duration_hours", "status"]
    missing = [c for c in required if c not in tasks.columns]
    if missing:
        raise ValueError(f"maintenance_tasks.csv missing columns: {', '.join(missing)}")

    reference_date = pd.Timestamp(corridor["date"].min()) if len(corridor) else pd.Timestamp.today().normalize()
    prioritized = _priority(tasks, assets, reference_date)
    windows = pd.DataFrame(_free_windows(corridor, trains))

    if windows.empty or prioritized.empty:
        assignments = pd.DataFrame(columns=[
            "task_id","department","asset_id","severity","status","section",
            "priority_score","is_emergency","block_id","window_id","date","block_start_time",
            "block_end_time","duration_min","assignment_status","reason"
        ])
        blocks = pd.DataFrame(columns=[
            "block_id","window_id","date","section","block_start","block_end",
            "block_duration_hours","available_capacity_hours","utilization_pct",
            "task_count","departments","task_ids","approval_status"
        ])
    else:
        candidates = []
        for task_index, task in prioritized.iterrows():
            duration = max(1, int(round(float(task["estimated_duration_hours"]) * 60)))
            possible = windows[
                (windows["section"].astype(str) == str(task["section"]))
                & (windows["capacity_min"] >= duration)
            ]
            for wi, window in possible.iterrows():
                candidates.append({
                    "task_index": task_index,
                    "task_id": task["task_id"],
                    "window_index": wi,
                    "window_id": window["window_id"],
                    "section": window["section"],
                    "date": window["date"],
                    "duration_min": duration,
                    "capacity_min": int(window["capacity_min"]),
                    "priority": float(task["priority_score"]),
                    "due_date": task["due_date"],
                })
        cand = pd.DataFrame(candidates)

        selected_ids = set()
        if not cand.empty:
            model = cp_model.CpModel()
            x = {i: model.NewBoolVar(f"x_{i}") for i in cand.index}
            for task_index in prioritized.index:
                ids = cand.index[cand["task_index"] == task_index].tolist()
                if ids:
                    model.Add(sum(x[i] for i in ids) <= 1)
            window_used = {}
            for wi in windows.index:
                ids = cand.index[cand["window_index"] == wi].tolist()
                if ids:
                    model.Add(sum(int(cand.loc[i, "duration_min"]) * x[i] for i in ids)
                              <= int(windows.loc[wi, "capacity_min"]))
                    window_used[wi] = model.NewBoolVar(f"window_used_{wi}")
                    for i in ids:
                        model.Add(x[i] <= window_used[wi])

            objective = []
            for i in cand.index:
                due = pd.Timestamp(cand.loc[i, "due_date"])
                wdate = pd.Timestamp(cand.loc[i, "date"])
                delay_days = max(0, (wdate - due).days)
                reward = int(round(float(cand.loc[i, "priority"]) * 100))
                delay_penalty = delay_days * 120
                small_time_penalty = int(cand.loc[i, "window_index"]) % 100
                objective.append((reward - delay_penalty - small_time_penalty) * x[i])
            for wi, var in window_used.items():
                objective.append(-180 * var)
            model.Maximize(sum(objective))

            solver = cp_model.CpSolver()
            solver.parameters.max_time_in_seconds = 15
            solver.parameters.num_search_workers = 8
            solver.Solve(model)
            selected_ids = {i for i in cand.index if solver.Value(x[i]) == 1}

        selected = cand.loc[sorted(selected_ids)].copy() if selected_ids else pd.DataFrame(columns=cand.columns)
        if len(selected):
            selected = selected.merge(
                prioritized[["task_id","department","asset_id","severity","status","is_emergency"]],
                on="task_id", how="left"
            )
            selected["block_start"] = selected["window_index"].map(windows["start_min"])
            selected["block_end"] = selected["block_start"] + selected["duration_min"]
            selected["block_start_time"] = selected["block_start"].map(to_time)
            selected["block_end_time"] = selected["block_end"].map(to_time)
            selected["assignment_status"] = "Scheduled"
            selected["reason"] = "Conflict-free window selected by CP-SAT"
        else:
            selected = pd.DataFrame(columns=[
                "task_id","department","asset_id","severity","status","section",
                "priority","window_id","date","duration_min","block_start",
                "block_end","block_start_time","block_end_time","assignment_status","reason"
            ])

        selected_task_ids = set(selected["task_id"].astype(str)) if len(selected) else set()
        unscheduled = prioritized[~prioritized["task_id"].astype(str).isin(selected_task_ids)].copy()
        if len(unscheduled):
            unscheduled_rows = []
            for _, r in unscheduled.iterrows():
                unscheduled_rows.append({
                    "task_id": r["task_id"], "department": r["department"],
                    "asset_id": r["asset_id"], "severity": r["severity"],
                    "status": r["status"], "section": r["section"],
                    "is_emergency": bool(str(r.get("is_emergency", False)).lower() in ("true", "yes", "1")),
                    "priority": float(r["priority_score"]), "window_id": "",
                    "date": "", "duration_min": int(round(float(r["estimated_duration_hours"]) * 60)),
                    "block_start": None, "block_end": None,
                    "block_start_time": "", "block_end_time": "",
                    "assignment_status": "Unscheduled",
                    "reason": "No suitable conflict-free maintenance window"
                })
            selected = pd.concat([selected, pd.DataFrame(unscheduled_rows)], ignore_index=True)

        selected["priority_score"] = selected.get("priority", selected.get("priority_score", 0))
        selected.drop(columns=["priority"], inplace=True, errors="ignore")
        selected["block_id"] = selected["window_id"].apply(lambda x: f"OPT-{x}" if x else "")
        assignments = selected[[
            "task_id","department","asset_id","severity","status","section",
            "priority_score","is_emergency","block_id","window_id","date","block_start_time",
            "block_end_time","duration_min","assignment_status","reason"
        ]].copy()

        block_rows = []
        scheduled = assignments[assignments["assignment_status"] == "Scheduled"].copy()
        if len(scheduled):
            for (window_id, section, date), group in scheduled.groupby(["window_id","section","date"]):
                win = windows[windows["window_id"] == window_id].iloc[0]
                used = int(group["duration_min"].sum())
                cap = int(win["capacity_min"])
                block_rows.append({
                    "block_id": f"OPT-{window_id}",
                    "window_id": window_id,
                    "date": date,
                    "section": section,
                    "block_start": group["block_start_time"].min(),
                    "block_end": to_time(tm(group["block_start_time"].min()) + used),
                    "block_duration_hours": round(used / 60, 2),
                    "available_capacity_hours": round(cap / 60, 2),
                    "utilization_pct": round(min(100, used / cap * 100), 2) if cap else 0,
                    "task_count": len(group),
                    "departments": ", ".join(sorted(group["department"].astype(str).unique())),
                    "task_ids": ", ".join(group["task_id"].astype(str)),
                    "approval_status": "pending_approval",
                })
        blocks = pd.DataFrame(block_rows)

    output_dir.mkdir(parents=True, exist_ok=True)
    prioritized.to_csv(output_dir / "live_priority_tasks.csv", index=False)
    assignments.to_csv(output_dir / "live_optimized_task_assignments.csv", index=False)
    blocks.to_csv(output_dir / "live_optimized_block_plan.csv", index=False)
    windows.to_csv(output_dir / "live_feasible_windows.csv", index=False)

    scheduled_count = int((assignments["assignment_status"] == "Scheduled").sum()) if len(assignments) else 0
    critical_scheduled = int((assignments["severity"].astype(str).str.lower() == "critical").sum()) if len(assignments) else 0
    overdue_scheduled = int(((assignments["status"].astype(str).str.lower() == "overdue") &
                            (assignments["assignment_status"] == "Scheduled")).sum()) if len(assignments) else 0
    multi_department = int(blocks["departments"].astype(str).str.contains(",", regex=False).sum()) if len(blocks) else 0
    avg_util = float(blocks["utilization_pct"].mean()) if len(blocks) else 0.0

    return {
        "scheduled_tasks": scheduled_count,
        "total_tasks": len(prioritized),
        "unscheduled_tasks": max(0, len(prioritized) - scheduled_count),
        "optimized_blocks": len(blocks),
        "average_block_utilization_pct": round(avg_util, 2),
        "critical_tasks_scheduled": critical_scheduled,
        "overdue_tasks_scheduled": overdue_scheduled,
        "multi_department_blocks": multi_department,
        "windows": len(windows),
        "reason": reason,
    }

