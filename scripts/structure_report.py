#!/usr/bin/env python3
"""
Generate a basic repository structure health report.

Outputs:
- reports/structure-status-log.md  (append-only log)
- reports/latest-pr-body.md        (latest PR body)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = REPO_ROOT / "reports"
LOG_FILE = REPORTS_DIR / "structure-status-log.md"
PR_BODY_FILE = REPORTS_DIR / "latest-pr-body.md"

# Adjust these to your expected structure
REQUIRED_DIRS = [
    ".github",
]

REQUIRED_FILES = [
    "README.md",
]


def check_required_paths() -> list[str]:
    problems: list[str] = []

    for rel in REQUIRED_DIRS:
        p = REPO_ROOT / rel
        if not p.exists() or not p.is_dir():
            problems.append(f"Missing required directory: `{rel}`")

    for rel in REQUIRED_FILES:
        p = REPO_ROOT / rel
        if not p.exists() or not p.is_file():
            problems.append(f"Missing required file: `{rel}`")

    return problems


def check_package_json() -> list[str]:
    problems: list[str] = []
    pkg = REPO_ROOT / "package.json"
    if pkg.exists():
        try:
            json.loads(pkg.read_text(encoding="utf-8"))
        except Exception as exc:
            problems.append(f"Invalid JSON in `package.json`: {exc}")
    return problems


def build_pr_body(timestamp: str, problems: list[str]) -> str:
    header = [
        "## Automated Structure Health Report",
        "",
        f"- **Generated at:** {timestamp}",
        "- **Workflow:** `.github/workflows/structure-report.yml`",
        "",
    ]

    if problems:
        status = [
            "### Status: ❌ Problems detected",
            "",
            "The following issues were detected:",
            "",
        ]
        items = [f"- {p}" for p in problems]
    else:
        status = [
            "### Status: ✅ OK",
            "",
            "No structural issues were detected.",
            "",
        ]
        items = ["- Return status: `OK`"]

    footer = [
        "",
        "---",
        "This PR was generated automatically by the scheduled report workflow.",
    ]

    return "\n".join(header + status + items + footer) + "\n"


def append_log(timestamp: str, problems: list[str]) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    if not LOG_FILE.exists():
        LOG_FILE.write_text(
            "# Structure Health Status Log\n\n"
            "Append-only history of automated repository structure checks.\n\n",
            encoding="utf-8",
        )

    status = "OK" if not problems else "PROBLEMS"
    lines = [
        f"## {timestamp}",
        f"- Status: **{status}**",
    ]
    if problems:
        lines.append("- Issues:")
        lines.extend([f"  - {p}" for p in problems])
    else:
        lines.append("- Issues: None")

    lines.append("")
    LOG_FILE.write_text(
        LOG_FILE.read_text(encoding="utf-8") + "\n".join(lines) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    problems = []
    problems.extend(check_required_paths())
    problems.extend(check_package_json())

    append_log(timestamp, problems)

    pr_body = build_pr_body(timestamp, problems)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    PR_BODY_FILE.write_text(pr_body, encoding="utf-8")

    print("Report generated.")
    print(f"Problems found: {len(problems)}")


if __name__ == "__main__":
    main()