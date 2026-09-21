import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / "data" / "maintenance_tasks.csv"
df = pd.read_csv(src)

# Make a visibly different test dataset without changing the original.
df = df.copy()
df.loc[:4, "severity"] = ["Critical", "High", "Critical", "High", "Critical"]
df.loc[:4, "status"] = ["Pending"] * 5
df.loc[:4, "estimated_duration_hours"] = [1.0, 1.5, 1.0, 0.5, 1.5]

out = ROOT / "data" / "demo_upload_maintenance_tasks.csv"
df.to_csv(out, index=False)
print(f"Created: {out}")
