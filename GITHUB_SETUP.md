# GitHub quick setup

1. Create an empty GitHub repository, for example `rail-automatic-block-planning`.
2. Copy this project into the repository root.
3. Do not commit `.venv`, `node_modules`, `.env`, or generated CSV outputs.
4. Push the project.
5. Deploy `backend`/root as the Render API using `render.yaml`.
6. Deploy `frontend` as a Vercel project with root directory `frontend`.

Recommended repository description:

> AI-assisted automatic railway maintenance block planning using priority scoring and OR-Tools CP-SAT optimization.
