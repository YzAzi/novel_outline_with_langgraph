from __future__ import annotations

import json
from pathlib import Path

from app.main import app


def main() -> None:
    schema = app.openapi()
    repo_root = Path(__file__).resolve().parents[2]
    backend_schema_path = repo_root / "backend" / "openapi.json"
    frontend_schema_path = repo_root / "frontend" / "src" / "types" / "api-schema.json"

    backend_schema_path.parent.mkdir(parents=True, exist_ok=True)
    frontend_schema_path.parent.mkdir(parents=True, exist_ok=True)

    backend_schema_path.write_text(json.dumps(schema, indent=2, ensure_ascii=True), encoding="utf-8")
    frontend_schema_path.write_text(json.dumps(schema, indent=2, ensure_ascii=True), encoding="utf-8")


if __name__ == "__main__":
    main()
