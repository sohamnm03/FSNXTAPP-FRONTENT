"""
The GUI lane's run journal — what actually happened, recorded by the run itself.

This is `web-tests/journal.ts` for the other lane, deliberately emitting the
**same NDJSON schema**. That is the whole design decision: one schema means
`scripts/check-run.ps1` reads a GUI-lane run the same way it reads a web-lane
one, `scripts/build-dashboard.ps1` counts it the same way, and the run file
renderer is one implementation rather than two that drift.

The rules it inherits, and why they matter more here than in the web lane:

  - **It never breaks a run.** Every entry point swallows its own errors. A
    journal that cannot write must not fail a run that is otherwise fine —
    the expensive failure is a real SAP write abandoned over a reporting bug.
  - **It never invents.** `check()` records the value it was handed. Nothing
    defaults, nothing infers. A field the run never read is absent here and
    prints `NOT OBSERVED` in the run file, which is CLAUDE.md rule 6 as a data
    flow rather than as a promise.
  - **It is append-and-flush, one line per action.** This is what makes an
    interrupted run recoverable: a killed process loses at most the line it was
    mid-write on, never what came before. TC-014's COM disconnect is exactly
    the scenario — see `docs/unattended-runs.md` § Recovering from an
    interrupted run.

Unlike the web lane there is no test runner underneath this, so there is no
`test.info()` to group entries by. Everything in one GUI-lane run belongs to
one case, so `testId` is a constant.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

REPO_ROOT = Path(__file__).resolve().parent.parent

#: The GUI lane's journals live beside the web lane's, one directory over.
#: `scripts/check-run.ps1` scans both roots.
JOURNAL_ROOT = REPO_ROOT / "results" / "gui"

#: Every entry in a GUI-lane run belongs to the one case being run. The field
#: exists only so the schema matches the web lane's, where a run can interleave
#: several tests.
_TEST_ID = "gui"

OUTCOMES = ("ok", "skipped", "error", "refused", "blocked")
CHECK_RESULTS = ("pass", "fail", "not-observed", "recorded")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Journal:
    """One run's journal. Append-only, flushed per line."""

    def __init__(self, run_id: str, system_id: str, case_id: str | None = None,
                 run_by: str = "", run_tag: str = ""):
        self.run_id = run_id
        self.system_id = system_id
        self.case_id = case_id
        self.run_by = run_by
        self.run_tag = run_tag
        self.path = JOURNAL_ROOT / system_id / "journal" / f"{run_id}.ndjson"
        if case_id:
            self.for_case(case_id)

    # ---------------------------------------------------------------- emit

    def _emit(self, **entry: Any) -> None:
        """Append one line. Swallows every error on purpose — see the header."""
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            entry["testId"] = _TEST_ID
            entry["at"] = _now()
            line = json.dumps(entry, ensure_ascii=False, default=str)
            # Open/append/close per line so a hard kill cannot lose a buffer.
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
                fh.flush()
                os.fsync(fh.fileno())
        except Exception:
            pass  # the run matters more than the record of it

    # -------------------------------------------------------------- writers

    def for_case(self, case_id: str) -> None:
        """Which case this run is of. Without it the renderer has no filename."""
        self.case_id = case_id
        self._emit(kind="meta", case=case_id)

    def meta(self, key: str, value: Any) -> None:
        """A free-form fact for the run file's header, e.g. dataset row."""
        self._emit(kind="meta", key=key, value=str(value))

    def step(self, description: str, outcome: str = "ok", detail: str | None = None) -> None:
        """One row of the run file's "Steps executed" table."""
        self._emit(kind="step", description=description, outcome=outcome, detail=detail)

    def check(self, description: str, expected: Any, observed: Any,
              result: str | None = None) -> str | None:
        """
        One row of the "Assertions" table, with the value actually read.

        `observed` is passed through unchanged, even when it is ugly
        (`100,000.00`, `10.0000000`) — reformatting would make the report say
        something the system did not.

        With no explicit `result` the row is `recorded`, not `pass`: this
        records, it does not assert. Use `checked()` for the version that
        asserts, so report and verdict cannot disagree.
        """
        obs = None if observed is None or observed == "" else str(observed)
        self._emit(
            kind="check",
            description=description,
            expected=str(expected),
            observed=obs,
            result=result or ("not-observed" if obs is None else "recorded"),
        )
        return obs

    def checked(self, description: str, expected: Any, observed: Any,
                predicate=None) -> Any:
        """
        Record and assert in one call.

        The failure path is the point: a failing predicate records the row as
        `fail` *before* raising, so a run that dies on its third assertion still
        reports the first two and the one that killed it.
        """
        if predicate is None:
            def predicate(o):
                return str(o) == str(expected)
        try:
            ok = predicate(observed)
        except Exception:
            self.check(description, expected, observed, "fail")
            raise
        self.check(description, expected, observed, "pass" if ok else "fail")
        if not ok:
            raise AssertionError(
                f"{description}: expected {expected!r}, observed {observed!r}"
            )
        return observed

    def document(self, doc_type: str, number: str | None, company_code: str = "",
                 lifecycle: Sequence[str] = (), left_in_place: bool = True,
                 note: str = "") -> None:
        """
        A business object this run wrote. One row of "Documents created".

        `number=None` is a real, reportable state — "attempted, wrote nothing" —
        and is not the same as no row at all.
        """
        self._emit(
            kind="document",
            docType=doc_type,
            number=number or None,
            companyCode=company_code,
            lifecycle=list(lifecycle),
            leftInPlace=left_in_place,
            note=note,
        )

    def document_reached(self, number: str, stage: str) -> None:
        """Extend a document's lifecycle after a later step, e.g. settled -> posted."""
        self._emit(kind="document", docType="", number=number,
                   lifecycle=[stage], leftInPlace=True)

    def evidence(self, file: str, shows: str) -> None:
        """One row of "Evidence". `file` is repo-relative."""
        self._emit(kind="evidence", file=file, shows=shows)

    def deviation(self, text: str) -> None:
        """
        Something that differed from the case.

        This is the field the freeze gate reads: `scripts/check-suite.ps1`
        refuses to count a PASS run that recorded a deviation toward the two
        clean runs a case needs to freeze. Recording one therefore costs
        something — which is exactly why the run records it, rather than a
        narrator deciding afterwards whether the popup "really counted".
        """
        self._emit(kind="deviation", text=text)

    def system_confirmed(self, where: str, system: str, client: str,
                         user: str = "", confirmed: bool | None = None) -> None:
        """
        CLAUDE.md rule 1 as a recorded fact.

        `confirmed` is the verdict of the DS4/100 check, not the fact that a
        check happened. The failing case is recorded too — what the screen said
        is evidence — so readers must read the flag, not the row's existence.
        """
        self._emit(kind="system", where=where, system=system, client=client,
                   user=user, confirmed=confirmed)

    def verdict(self, verdict: str, why: str) -> None:
        """
        Override the verdict the renderer would otherwise derive.

        Only for what the runner cannot see: an unmet precondition is `BLOCKED`,
        not a product failure; a batch that wrote six of ten rows is `PARTIAL`
        even with no exception raised.
        """
        self._emit(kind="verdict", verdict=verdict, why=why)


def read_journal(path: Path) -> list[dict]:
    """
    Parse a journal, tolerating a torn last line.

    A kill mid-write loses at most one line; losing the rest of the file with it
    would defeat the reason the journal exists. Same tolerance as
    `web-tests/reporters/result-file.ts` and `scripts/check-run.ps1`.
    """
    if not path.exists():
        return []
    out: list[dict] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except Exception:
            pass
    return out
