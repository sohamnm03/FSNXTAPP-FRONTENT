"""
Renders `results/TC-<case>-<date>-<time>.md` from a GUI-lane journal.

This is `web-tests/reporters/result-file.ts` for the other lane. It is a
separate implementation for one unavoidable reason — that one is a Playwright
`Reporter`, and the GUI lane has no Playwright underneath it — but it reads the
same journal schema and emits the same document shape, so
`scripts/build-dashboard.ps1` and `scripts/check-suite.ps1` cannot tell which
lane wrote a run file, and neither can a reader.

The rule it exists to enforce is the one a hand-written report cannot:
**nothing is filled in.** An assertion whose value nobody recorded prints
`NOT OBSERVED`, never a plausible number. There is no code path here that
writes an expected value into an observed cell.
"""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Iterable

from .journal import REPO_ROOT, read_journal

RESULTS_DIR = REPO_ROOT / "results"
CASE_DIR = REPO_ROOT / "test-cases"


def _cell(value) -> str:
    """Table cells are pipe-delimited; a value containing one would split the row."""
    if value is None or value == "":
        return ""
    return str(value).replace("|", "\\|").replace("\r", " ").replace("\n", " ").strip()


def _repo_relative(path: Path) -> str:
    """
    A repo-relative path for the report, falling back to the absolute one.

    Never raises. This function runs *after* the run has already written to a
    live client, so a path that happens to sit outside the repo (a relocated
    journal, a self-test) must cost a slightly uglier line in the report, never
    the whole record of what was just written.
    """
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def _find_case_file(case_id: str) -> str | None:
    """
    Cases live one folder deeper than the id suggests -- `test-cases/GUI-TC/`
    for this lane, `test-cases/Web-TC/` for the other. Recursing keeps the
    lookup working whichever folder a case ends up in.
    """
    if not CASE_DIR.is_dir():
        return None
    for path in sorted(CASE_DIR.rglob(f"{case_id}-*.md")):
        return _repo_relative(path)
    return None


def _merge_documents(entries: Iterable[dict]) -> list[dict]:
    """
    One row per document, however many times the run touched it.

    A deal is created, then settled, then posted — three entries about one
    object. Reported as three rows, the dashboard would count three documents
    where the run wrote one, and the count of what is sitting in the client is
    the number people act on.
    """
    by_number: dict[str, dict] = {}
    anonymous: list[dict] = []
    for entry in entries:
        doc = {
            "docType": entry.get("docType") or "",
            "number": entry.get("number"),
            "companyCode": entry.get("companyCode") or "",
            "lifecycle": list(entry.get("lifecycle") or []),
            "leftInPlace": entry.get("leftInPlace") is not False,
            "note": entry.get("note") or "",
        }
        number = doc["number"]
        if not number:
            anonymous.append(doc)
            continue
        existing = by_number.get(number)
        if existing is None:
            by_number[number] = doc
            continue
        if not existing["docType"] and doc["docType"]:
            existing["docType"] = doc["docType"]
        if not existing["companyCode"] and doc["companyCode"]:
            existing["companyCode"] = doc["companyCode"]
        if doc["note"]:
            existing["note"] = (f"{existing['note']}; {doc['note']}"
                                if existing["note"] else doc["note"])
        existing["leftInPlace"] = existing["leftInPlace"] and doc["leftInPlace"]
        for stage in doc["lifecycle"]:
            if stage not in existing["lifecycle"]:
                existing["lifecycle"].append(stage)
    return [*by_number.values(), *anonymous]


def derive_verdict(entries: list[dict], failed: bool, blocked: bool) -> tuple[str, str]:
    """
    An explicit verdict wins; otherwise it is derived from what happened.

    Only the run knows the difference between "the product is broken" (FAIL) and
    "a precondition was not met" (BLOCKED), which is why `journal.verdict()`
    exists at all.
    """
    for entry in reversed(entries):
        if entry.get("kind") == "verdict":
            return str(entry.get("verdict")), str(entry.get("why") or "")
    if blocked:
        return "BLOCKED", "a precondition was not met"
    if failed:
        return "FAIL", ""
    steps = [e for e in entries if e.get("kind") == "step"]
    if steps and any(s.get("outcome") == "skipped" for s in steps):
        return "PARTIAL", "some steps were skipped"
    return "PASS", ""


def render(run_id: str, system_id: str, *, started_at: datetime,
           failed: bool = False, blocked: bool = False,
           error: str | None = None, run_by: str = "", command: str = "",
           journal_path: Path | None = None) -> Path | None:
    """Write the run file. Returns its path, or None if the journal has no case id."""
    path = journal_path or (REPO_ROOT / "results" / "gui" / system_id / "journal"
                            / f"{run_id}.ndjson")
    entries = read_journal(path)
    if not entries:
        return None

    case_id = next((e.get("case") for e in entries
                    if e.get("kind") == "meta" and e.get("case")), None)
    if not case_id:
        return None

    def pick(kind: str) -> list[dict]:
        return [e for e in entries if e.get("kind") == kind]

    finished_at = datetime.now()
    duration = (finished_at - started_at).total_seconds()
    wall = f"{duration:.0f} s" if duration < 60 else f"{duration / 60:.1f} min"
    verdict, why = derive_verdict(entries, failed, blocked)

    out: list[str] = []
    human = started_at.strftime("%Y-%m-%d %H:%M")
    out.append(f"# {case_id} — run {human}")
    out.append("")

    # ---- header: every value observed or supplied, none derived
    systems = pick("system")
    refuted = any(s.get("confirmed") is False for s in systems)
    unstated = bool(systems) and all(s.get("confirmed") is None for s in systems)
    if not systems:
        system_line = f"{system_id} (registry id — no screen confirmation recorded this run)"
        user = None
    else:
        bad = next((s for s in systems if s.get("confirmed") is False), systems[0])
        system_line = (f"{bad.get('system') or 'NOT OBSERVED'} / client "
                       f"{bad.get('client') or 'NOT OBSERVED'}")
        user = next((s.get("user") for s in systems if s.get("user")), None)

    if refuted:
        confirmed_text = "**NO — the DS4/100 check FAILED on this run**"
    elif unstated:
        confirmed_text = "attempted (verdict not recorded by this run)"
    else:
        confirmed_text = "yes" if systems else "no"

    at_n = f" at {len(systems)} t-codes" if len(systems) > 1 else ""
    out.append(f"- **Case:** `{_find_case_file(case_id) or f'test-cases/{case_id}'}`")
    out.append(f"- **System:** {system_line} — "
               f"**confirmed via `sap_get_session_info`{at_n}:** {confirmed_text}")
    out.append(f"- **Session:** SAP GUI for Windows (`gui_tests`, direct COM), "
               f"user `{user or 'NOT OBSERVED'}`")
    out.append(f"- **Run by:** {run_by or 'unattended run (scripts/run-gui-case.ps1)'}")
    if command:
        out.append(f"- **Command:** `{command}`")
    out.append(f"- **Wall clock:** {wall}")
    for meta in pick("meta"):
        if meta.get("key"):
            out.append(f"- **{meta['key']}:** {meta.get('value')}")
    out.append(f"- **Verdict:** {verdict}{f' — {why}' if why else ''}")
    out.append("")
    out.append("_Generated by the run itself (`gui_tests/render_result.py`). Observed values are")
    out.append("what the run read off the screen; anything it did not read reads `NOT OBSERVED`._")
    out.append("")

    # ---- assertions
    out.append("## Assertions")
    out.append("")
    out.append("| # | Expected | Observed | Result |")
    out.append("|---|---|---|---|")
    checks = pick("check")
    if checks:
        for i, check in enumerate(checks, start=1):
            result = check.get("result")
            shown = ("NOT OBSERVED" if result == "not-observed"
                     else "recorded — not asserted" if result == "recorded"
                     else result)
            observed = check.get("observed")
            observed_cell = "NOT OBSERVED" if observed is None else f"`{_cell(observed)}`"
            out.append(f"| {i} | {_cell(check.get('description'))} — "
                       f"`{_cell(check.get('expected'))}` | {observed_cell} | {shown} |")
    else:
        out.append("| — | no assertion was recorded by this run | NOT OBSERVED | NOT OBSERVED |")
    out.append("")
    out.append("A value that could not be read is `NOT OBSERVED`. Never a plausible guess.")
    out.append("")

    # ---- steps
    out.append("## Steps executed")
    out.append("")
    out.append("| # | Step | Outcome |")
    out.append("|---|---|---|")
    steps = pick("step")
    if steps:
        for i, step in enumerate(steps, start=1):
            detail = f" — {_cell(step.get('detail'))}" if step.get("detail") else ""
            out.append(f"| {i} | {_cell(step.get('description'))} | "
                       f"{step.get('outcome')}{detail} |")
    else:
        out.append("| — | this run recorded no steps | NOT OBSERVED |")
    out.append("")

    # ---- deviations
    out.append("## Deviations")
    out.append("")
    deviations = pick("deviation")
    if deviations or error:
        for dev in deviations:
            out.append(f"- {dev.get('text')}")
        if error:
            out.append(f"- The run ended with an error: {_cell(error)}")
    else:
        # Exactly "None." and nothing else. scripts/check-suite.ps1 reads this
        # section to decide whether a PASS run counts toward the two clean runs
        # a case needs before it can be frozen, and it recognises that one
        # spelling — any elaboration here reads to it as a recorded deviation
        # and quietly stops every clean run from ever counting.
        out.append("None.")
    out.append("")

    # ---- documents
    out.append("## Documents created")
    out.append("")
    docs = _merge_documents(pick("document"))
    if docs:
        out.append("| Type | Number | Left in place? |")
        out.append("|---|---|---|")
        for doc in docs:
            cc = f", co.code {doc['companyCode']}" if doc["companyCode"] else ""
            number = (f"**{_cell(doc['number'])}**" if doc["number"]
                      else "none — no number was returned")
            lifecycle = f" — {', '.join(doc['lifecycle'])}" if doc["lifecycle"] else ""
            note = f" ({_cell(doc['note'])})" if doc["note"] else ""
            out.append(f"| {_cell(doc['docType'])}{cc} | {number} | "
                       f"{'yes' if doc['leftInPlace'] else 'no'}{lifecycle}{note} |")
        out.append("")
        # The machine-readable form scripts/build-dashboard.ps1 prefers (tier 2),
        # so the dashboard never has to guess at the prose above.
        out.append("```objects")
        out.append(f"attempted: {len(docs)}")
        for doc in docs:
            out.append(" | ".join([
                doc["docType"],
                doc["number"] or "none",
                doc["companyCode"],
                " ".join(doc["lifecycle"]),
                "yes" if doc["leftInPlace"] else "no",
                doc["note"],
            ]))
        out.append("```")
    else:
        out.append("None recorded by this run.")
    out.append("")

    # ---- evidence
    out.append("## Evidence")
    out.append("")
    shots = pick("evidence")
    if shots:
        out.append("| File | Shows |")
        out.append("|---|---|")
        seen: set[str] = set()
        for shot in shots:
            if shot.get("file") in seen:
                continue
            seen.add(shot.get("file"))
            out.append(f"| `{_cell(shot.get('file'))}` | {_cell(shot.get('shows'))} |")
    else:
        out.append("None recorded by this run.")
    out.append("")
    out.append(f"Journal: `{_repo_relative(path)}`")
    out.append("")

    # ---- write, never overwriting an existing record
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    tag = os.environ.get("SAP_RUN_TAG", "").strip()
    suffix = f"-{''.join(c if c.isalnum() or c in '._-' else '-' for c in tag)}" if tag else ""
    base = f"{case_id}-{started_at.strftime('%Y-%m-%d-%H%M')}{suffix}"
    target = RESULTS_DIR / f"{base}.md"
    n = 2
    while target.exists():
        target = RESULTS_DIR / f"{base}-{n}.md"
        n += 1
    target.write_text("\n".join(out), encoding="utf-8")
    return target
