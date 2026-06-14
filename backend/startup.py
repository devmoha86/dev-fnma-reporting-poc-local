"""
startup.py — runs dbt seed + dbt run before the FastAPI server starts.

WHY RUN dbt HERE?
  This keeps the architecture self-contained for local dev: a single
  `uvicorn main:app` both refreshes the data warehouse and starts the API.
  In production you'd run dbt in a scheduled pipeline (Airflow, Step Functions)
  and the API would just read — this module would be a no-op.

CALLED FROM: main.py via FastAPI's lifespan hook (startup event).
"""

import subprocess
import sys
import os

DBT_PROJECT_DIR = os.path.join(os.path.dirname(__file__), "dbt_project")


def run_dbt():
    """Run `dbt seed` then `dbt run` in the dbt project directory."""
    print("[dbt] starting dbt build ...")
    for cmd in [["dbt", "seed", "--profiles-dir", "."],
                ["dbt", "run",  "--profiles-dir", "."]]:
        result = subprocess.run(
            cmd,
            cwd=DBT_PROJECT_DIR,
            capture_output=True,
            text=True,
        )
        print(result.stdout)
        if result.returncode != 0:
            print(result.stderr, file=sys.stderr)
            raise RuntimeError(f"dbt command failed: {' '.join(cmd)}")
    print("[dbt] build complete — DuckDB is ready")
