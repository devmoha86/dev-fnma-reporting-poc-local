"""
db/connection.py — DuckDB connection singleton.

WHY A SINGLETON?
  DuckDB in "file mode" allows multiple read connections but only one writer
  at a time. Since dbt runs at startup (as a separate process) and then FastAPI
  reads afterward, we open one read-only connection for the life of the process.
  read_only=True prevents accidental writes from API code.

ATHENA SWAP:
  Replace this module with a boto3/pyathena connection. The rest of the API
  code uses execute_query() and never imports duckdb directly, so only this
  file changes.
"""

import duckdb
import os

_DB_PATH = os.path.join(os.path.dirname(__file__), "fnma.duckdb")
_conn: duckdb.DuckDBPyConnection | None = None


def get_connection() -> duckdb.DuckDBPyConnection:
    """Return the shared read-only DuckDB connection, creating it if needed."""
    global _conn
    if _conn is None:
        print(f"[db] opening DuckDB at {_DB_PATH}")
        _conn = duckdb.connect(_DB_PATH, read_only=True)
    return _conn


def execute_query(sql: str, params: list | None = None) -> list[dict]:
    """
    Run a parameterised SQL query and return rows as a list of dicts.

    DuckDB uses $1, $2, ... for positional parameters (same as PostgreSQL),
    which is also valid in Athena's prepared-statement API — so query strings
    are portable.

    Example:
        execute_query(
            "SELECT * FROM mart_kpi_summary WHERE servicer_number = $1",
            ["SVC-001"]
        )
    """
    conn = get_connection()
    rel = conn.execute(sql, params or [])
    cols = [desc[0] for desc in rel.description]
    return [dict(zip(cols, row)) for row in rel.fetchall()]
