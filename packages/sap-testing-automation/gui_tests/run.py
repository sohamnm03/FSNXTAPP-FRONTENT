"""
The GUI lane's unattended entry point — `scripts/run-case.ps1` for the other lane.

Resolves a case from `config/gui-runs.json`, confirms the writes, takes a run
lock, drives SAP, and writes the run file from the journal the run itself
produced. No model decides anything at run time.

Usually invoked through `scripts/run-gui-case.ps1`, which supplies the vendored
interpreter. Runnable directly with that interpreter for debugging:

    tools\\mcp-sap-gui\\.venv\\Scripts\\python.exe -m gui_tests.run --list
    tools\\mcp-sap-gui\\.venv\\Scripts\\python.exe -m gui_tests.run --case TC-014 --dry-run
"""
from __future__ import annotations

import argparse
import importlib
import inspect
import json
import os
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from gui_tests.journal import Journal  # noqa: E402
from gui_tests.render_result import render  # noqa: E402
from gui_tests.session import ComDisconnected, GuiSession, SystemMismatch, WriteRefused  # noqa: E402

REGISTRY = REPO_ROOT / "config" / "gui-runs.json"
SYSTEMS = REPO_ROOT / "config" / "sap-systems.json"

#: The Windows console is cp1252, so an em dash prints as a replacement
#: character. Journal and run-file text keep their typography (those are written
#: as UTF-8 to disk); only console output is folded down to ASCII. Done in one
#: helper rather than by policing every literal, so a later message cannot
#: reintroduce the problem.
_CONSOLE_FOLD = str.maketrans({
    "—": "-", "–": "-", "‘": "'", "’": "'",
    "“": '"', "”": '"', "…": "...", " ": " ",
    "→": "->", "×": "x", "§": "section", "≤": "<=", "≥": ">=",
})


def say(text: str = "") -> None:
    """
    Print, with typography folded to what a Windows console can render.

    The table handles the characters this codebase actually uses; the encode
    round-trip is the backstop, so a character nobody thought to add degrades to
    '?' instead of raising UnicodeEncodeError mid-run. Printing must never be the
    thing that kills a run that has already written to a live client.
    """
    folded = str(text).translate(_CONSOLE_FOLD)
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    try:
        folded.encode(encoding)
    except (UnicodeEncodeError, LookupError):
        folded = folded.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(folded)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_system(system_id: str | None) -> tuple[str, str, str]:
    """
    (registry id, SAP system name, client) from the one registry both lanes read.

    `config/sap-systems.json` is the single source of truth for the GUI lane and
    the web lane alike — there is no second place to add a system, and therefore
    no way for the two lanes to disagree about what they are allowed to drive.
    """
    registry = load_json(SYSTEMS)
    sid = system_id or registry.get("defaultSystem")
    systems = {s["id"]: s for s in (registry.get("systems") or []) if s.get("id")}
    entry = systems.get(sid)
    if entry is None:
        raise SystemExit(f"System {sid!r} is not in config/sap-systems.json. "
                         f"Known: {', '.join(sorted(systems))}")
    if not entry.get("enabled", False):
        raise SystemExit(f"System {sid!r} is present but disabled in config/sap-systems.json.")

    name = str(entry.get("systemId") or sid)
    client = str(entry.get("client", ""))

    # Production is refused outright, in both lanes, by the same rule (CLAUDE.md
    # rule 7). The web lane throws in sap-system.ts; this is that check. The role
    # is checked as well as the name, because a production system added under an
    # innocuous id would pass a name test alone.
    haystack = f"{sid} {name} {entry.get('label', '')} {entry.get('role', '')}".lower()
    for marker in ("prd", "ps4", "prod"):
        if marker in haystack:
            raise SystemExit(
                f"Refusing to run against {sid!r} — it looks like a production system "
                f"(matched {marker!r}). CLAUDE.md rule 7: no production, ever."
            )
    return sid, name, client


class RunLock:
    """
    One run of one case at a time.

    The web lane learned this the hard way on 2026-08-18: a run believed dead was
    still alive, a second was started, and both independently wrote the same
    dataset rows — four duplicate live deals. A lock file naming its pid is what
    lets the next run tell "still going" from "died and left this behind".
    """

    def __init__(self, system_id: str, case_id: str):
        self.path = REPO_ROOT / "results" / "gui" / system_id / f"{case_id}.lock"

    def acquire(self, force: bool = False) -> None:
        if self.path.exists():
            content = self.path.read_text(encoding="utf-8", errors="replace").strip()
            pid_text = content.split("|", 1)[0].strip()
            alive = False
            if pid_text.isdigit():
                alive = _pid_alive(int(pid_text))
            if alive and not force:
                raise SystemExit(
                    f"A run of this case is already in progress: pid {pid_text} is ALIVE "
                    f"({content}).\nDo not start a second one — see docs/unattended-runs.md "
                    f"§ Recovering from an interrupted run. Check with the person running it "
                    f"first; scripts/check-run.ps1 -Latest shows what it has written so far."
                )
            if not pid_text.isdigit() and not force:
                # A torn lock means a process died between creating it and
                # writing to it, so something WAS mid-run. That is a reason to be
                # more careful, not less.
                raise SystemExit(
                    f"Lock file {self.path.name} holds no usable pid (content: {content!r}). "
                    f"Treat it as held, not stale — confirm no run is alive before removing it."
                )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(f"{os.getpid()}|{datetime.now().isoformat(timespec='seconds')}",
                             encoding="utf-8")

    def release(self) -> None:
        try:
            self.path.unlink(missing_ok=True)
        except Exception:
            pass


def _pid_alive(pid: int) -> bool:
    try:
        import ctypes
        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
        return False
    except Exception:
        try:
            os.kill(pid, 0)
            return True
        except Exception:
            return False


def confirm_writes(case_id: str, writes: list[str], system_id: str,
                   system_name: str, client: str, assume_yes: bool) -> None:
    """
    CLAUDE.md rule 3: name every database write before it runs, and wait.

    `--yes` carries an authorisation given in advance (a scheduled run), and is
    deliberately explicit so an unattended run is something someone chose rather
    than something that happened.
    """
    say()
    say(f"  {case_id} will make {len(writes)} database write(s) to "
          f"{system_name} / client {client}  ({system_id}):")
    for i, text in enumerate(writes, start=1):
        say(f"    {i}. {text}")
    say()
    if not writes:
        return
    if assume_yes:
        say("  Confirmed in advance (--yes).")
        return

    # Every failure to get an explicit "yes" must refuse, and refusing is the
    # only safe direction here: the alternative is writing to a live client
    # because nobody was there to say no. `isatty()` is not trustworthy on its
    # own — under Git Bash and some CI shells it reports a tty even with stdin
    # redirected, so the EOF it then hits has to be caught rather than crash
    # with a traceback that looks like a bug instead of a refusal.
    try:
        answer = input("  Type 'yes' to proceed: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        raise SystemExit(
            "Refusing to write: no confirmation was given (stdin is not interactive). "
            "Re-run with --yes if this run was authorised in advance."
        ) from None
    if answer != "yes":
        raise SystemExit("Not confirmed — nothing was run.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gui_tests.run",
        description="Run a GUI-lane test case unattended.",
    )
    parser.add_argument("--case", help="Case id, e.g. TC-014")
    parser.add_argument("--list", action="store_true", help="List runnable cases and exit")
    parser.add_argument("--stage", help="Stop after this stage")
    parser.add_argument("--resume", metavar="DEAL",
                        help="Settle/post an existing document instead of creating another")
    parser.add_argument("--rows", metavar="IDS",
                        help="Dataset row id(s) for a data-driven case, comma separated, "
                             "or 'all'. Only for a case whose module takes rows")
    parser.add_argument("--system", help="System id from config/sap-systems.json")
    parser.add_argument("--run-by", default="", help="Who is answerable. Recorded verbatim")
    parser.add_argument("--tag", default="", help="Suffix for the run filename")
    parser.add_argument("--yes", action="store_true",
                        help="Skip the write confirmation (authorised in advance)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would run, touch nothing")
    parser.add_argument("--force-lock", action="store_true",
                        help="Take the run lock even if one is held. Last resort")
    args = parser.parse_args(argv)

    registry = load_json(REGISTRY)
    cases = registry.get("cases") or {}

    if args.list or not args.case:
        say()
        say("  GUI-lane cases in config/gui-runs.json")
        say()
        for case_id, entry in sorted(cases.items()):
            say(f"    {case_id:<8} {entry.get('summary', '')}")
            say(f"    {'':<8} writes: {entry.get('writes', 'not stated')}")
        say()
        say('    tools\\mcp-sap-gui\\.venv\\Scripts\\python.exe -m gui_tests.run '
              '--case TC-014')
        say()
        return 0

    case_id = args.case.upper()
    entry = cases.get(case_id)
    if entry is None:
        raise SystemExit(
            f"{case_id} is not in config/gui-runs.json, so it cannot be launched by id. "
            f"That is deliberate — guessing a stage or a dataset means writing the wrong "
            f"thing to a live client. Known: {', '.join(sorted(cases)) or '(none)'}"
        )

    module = importlib.import_module(entry["module"])
    stage = args.stage or entry.get("defaultStage") or getattr(module, "DEFAULT_STAGE", None)
    stages = getattr(module, "STAGES", ())
    if stage and stages and stage not in stages:
        raise SystemExit(f"Unknown stage {stage!r} for {case_id}. Known: {', '.join(stages)}")

    system_id, system_name, client = resolve_system(args.system or entry.get("system"))

    # Rows are opt-in per case. A module that takes none is called exactly as
    # before, so adding this changed nothing for TC-014 or TC-015; asking for rows
    # on a case that cannot use them is refused rather than ignored, because a
    # silently dropped --rows would write the default row instead of the asked-for
    # one.
    takes_rows = "rows" in inspect.signature(module.run).parameters
    if args.rows and not takes_rows:
        raise SystemExit(
            f"{case_id} is not data-driven, so --rows {args.rows!r} has nothing to "
            f"select. Remove it, or pick a case with a dataset."
        )
    rows = args.rows or (entry.get("defaultRows") if takes_rows else None)

    if hasattr(module, "writes_for"):
        params = inspect.signature(module.writes_for).parameters
        writes_kwargs: dict[str, object] = {}
        if "rows" in params:
            writes_kwargs["rows"] = rows
        if "resume" in params:
            # A resume creates no new deal — the module itself knows which
            # WRITES entry that is (by stage key, not by matching text), so it
            # drops it. A module whose writes_for doesn't take `resume` has no
            # resumable stage at all and returns its full list unchanged.
            writes_kwargs["resume"] = bool(args.resume)
        writes = module.writes_for(stage, **writes_kwargs)
    else:
        writes = []

    if args.dry_run:
        say()
        say(f"  {case_id}  ({entry.get('summary', '')})")
        say(f"    module   {entry['module']}")
        say(f"    stage    {stage}")
        say(f"    system   {system_name} / client {client}  ({system_id})")
        if takes_rows:
            say(f"    dataset  {entry.get('dataset', '(named in the module)')}")
            say(f"    rows     {rows}")
        if args.resume:
            say(f"    resume   against deal {args.resume}")
        say(f"    writes   {len(writes)}")
        for i, text in enumerate(writes, start=1):
            say(f"      {i}. {text}")
        say()
        say("  --dry-run: nothing was run.")
        say()
        return 0

    confirm_writes(case_id, writes, system_id, system_name, client, args.yes)

    if args.tag:
        os.environ["SAP_RUN_TAG"] = args.tag

    started_at = datetime.now()
    run_id = started_at.strftime("%Y%m%d-%H%M%S")
    journal = Journal(run_id, system_id, case_id, run_by=args.run_by, run_tag=args.tag)
    lock = RunLock(system_id, case_id)
    lock.acquire(force=args.force_lock)

    command = "python -m gui_tests.run " + " ".join(
        part for part in [
            f"--case {case_id}",
            f"--stage {stage}" if stage else "",
            f"--rows {rows}" if rows else "",
            f"--resume {args.resume}" if args.resume else "",
        ] if part
    )

    failed = blocked = False
    error_text: str | None = None
    deal_number: str | None = None

    say()
    say(f"  {case_id} — run {run_id}  ({system_name}/{client})")
    say(f"  journal  results/gui/{system_id}/journal/{run_id}.ndjson")
    say()

    sap = GuiSession(journal, expect_system=system_name, expect_client=client)
    try:
        info = sap.attach()
        say(f"  attached to {info['system']}/{info['client']} as {info['user']}")
        sap.assert_dev_system("attach")
        run_kwargs = {"stage": stage, "deal_number": args.resume}
        if takes_rows:
            run_kwargs["rows"] = rows
        deal_number = module.run(sap, **run_kwargs)
        if deal_number:
            say(f"  document {deal_number}")
    except SystemMismatch as exc:
        blocked = True
        error_text = str(exc)
        journal.verdict("BLOCKED", "the system check failed — see Deviations")
        say(f"  BLOCKED: {exc}")
    except WriteRefused as exc:
        failed = True
        error_text = str(exc)
        journal.deviation(f"A write was refused and nothing was committed for it: {exc}")
        say(f"  REFUSED: {exc}")
    except ComDisconnected as exc:
        failed = True
        error_text = str(exc)
        journal.deviation(
            f"The run ended on an unrecovered COM disconnect: {exc} "
            f"Confirm in SAP what actually landed before re-running — "
            f"see docs/unattended-runs.md § Recovering from an interrupted run."
        )
        say(f"  COM DISCONNECT: {exc}")
    except Exception as exc:  # noqa: BLE001 — the run file must record any ending
        failed = True
        error_text = f"{type(exc).__name__}: {exc}"
        say(f"  ERROR: {error_text}")
    finally:
        lock.release()

    result_path = render(
        run_id, system_id,
        started_at=started_at, failed=failed, blocked=blocked, error=error_text,
        run_by=args.run_by, command=command,
    )
    if result_path:
        say(f"  run file results/{result_path.name}")
    else:
        say("  no run file written — the journal recorded no case id")
    say()
    return 1 if (failed or blocked) else 0


if __name__ == "__main__":
    # SystemExit messages are printed by Python itself, which bypasses say() and
    # so re-introduces the cp1252 problem on exactly the messages that matter
    # most — the refusals. Folded here so a refusal stays readable.
    try:
        raise SystemExit(main())
    except SystemExit as exit_request:
        code = exit_request.code
        if isinstance(code, str):
            say(code)
            raise SystemExit(2) from None
        raise
