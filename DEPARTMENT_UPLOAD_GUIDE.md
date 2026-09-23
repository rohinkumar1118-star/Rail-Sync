# ABMS Department-wise Upload Upgrade

This upgrade keeps the existing ABMS optimization pipeline and adds separate CSV upload support for:
- Engineering tasks/assets
- S&T tasks/assets
- Traction tasks/assets

When a department file is uploaded through the ABMS UI, the backend stores it in runtime storage and rebuilds:
- `backend/storage/runtime/maintenance_tasks.csv`
- `backend/storage/runtime/assets.csv`

The existing CP-SAT optimizer continues to consume these unified files.

## Upload order
Upload all three task files and all three asset files before running **Generate Plan** for a complete multi-department demo.

## Task schema
`task_id, department, asset_id, section, location_km, task_type, severity, safety_critical, due_date, estimated_duration_hours, status`

## Asset schema
`asset_id, asset_type, department, section, location_km, importance, last_maintenance`

The original unified datasets remain in `data/` as fallback/demo data.
