from __future__ import annotations

from pathlib import Path
import pandas as pd


TASK_FILES = {
    "Engineering": "engineering_tasks.csv",
    "S&T": "snt_tasks.csv",
    "Traction": "traction_tasks.csv",
}

ASSET_FILES = {
    "Engineering": "engineering_assets.csv",
    "S&T": "snt_assets.csv",
    "Traction": "traction_assets.csv",
}


def _read_if_exists(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def _normalize_department(df: pd.DataFrame, department: str) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    out["department"] = department
    return out


def merge_department_tasks(runtime: Path, data: Path) -> pd.DataFrame:
    """Merge uploaded department task files into the optimizer's unified task file.

    Runtime uploads take precedence over demo/static files. If no department
    uploads exist, the existing unified maintenance_tasks.csv remains active.
    """
    frames = []
    for department, filename in TASK_FILES.items():
        path = runtime / filename
        if path.exists():
            frames.append(_normalize_department(pd.read_csv(path), department))

    if not frames:
        return _read_if_exists(runtime / "maintenance_tasks.csv") if (runtime / "maintenance_tasks.csv").exists() else _read_if_exists(data / "maintenance_tasks.csv")

    merged = pd.concat(frames, ignore_index=True)
    merged = merged.drop_duplicates(subset=["task_id"], keep="last")
    merged.to_csv(runtime / "maintenance_tasks.csv", index=False)
    return merged


def merge_department_assets(runtime: Path, data: Path) -> pd.DataFrame:
    frames = []
    for department, filename in ASSET_FILES.items():
        path = runtime / filename
        if path.exists():
            frames.append(_normalize_department(pd.read_csv(path), department))

    if not frames:
        return _read_if_exists(runtime / "assets.csv") if (runtime / "assets.csv").exists() else _read_if_exists(data / "assets.csv")

    merged = pd.concat(frames, ignore_index=True)
    merged = merged.drop_duplicates(subset=["asset_id"], keep="last")
    merged.to_csv(runtime / "assets.csv", index=False)
    return merged


def department_upload_status(runtime: Path, data: Path) -> dict:
    result = {"tasks": {}, "assets": {}, "totals": {"tasks": 0, "assets": 0}}

    for department, filename in TASK_FILES.items():
        path = runtime / filename
        if path.exists():
            df = pd.read_csv(path)
            result["tasks"][department] = {"uploaded": True, "records": len(df), "file": filename}
            result["totals"]["tasks"] += len(df)
        else:
            result["tasks"][department] = {"uploaded": False, "records": 0, "file": filename}

    for department, filename in ASSET_FILES.items():
        path = runtime / filename
        if path.exists():
            df = pd.read_csv(path)
            result["assets"][department] = {"uploaded": True, "records": len(df), "file": filename}
            result["totals"]["assets"] += len(df)
        else:
            result["assets"][department] = {"uploaded": False, "records": 0, "file": filename}

    result["unified_tasks_file"] = "maintenance_tasks.csv"
    result["unified_assets_file"] = "assets.csv"
    return result
