---
name: check-run
description: Read back what a test run actually did, from its own journal, before deciding whether to resume or re-run it. Use whenever a run was interrupted (network drop, killed shell, closed window, a command that timed out), when asked what a run wrote, or before resuming any case that may already have written to SAP.
---

# Check what a run actually did

Read-only. Touches no SAP system, writes nothing, and is safe to run at any
time — including while something else is running.

## When this matters

A session can stop mid-run after some of it has already written to SAP. Two
things are true at that moment:

- **The journal has everything up to the stop.** `web-tests/journal.ts` appends
  one line per action, so a killed process loses at most the line it was
  writing — never what came before.
- **No run file exists.** `results/TC-*.md` is rendered by the Playwright
  reporter's `onEnd`, which only fires on a clean exit. A hard kill never
  reaches it, so the journal is the only record until someone reads it.

## Run it

```powershell
powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -List
powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -Latest
powershell -ExecutionPolicy Bypass -File "scripts\check-run.ps1" -RunId 20260819-124024
```

`-List` browses every journal (run id, system, case, document count, how long
ago, verdict). `-Latest` inspects the most recent. `-RunId` accepts a partial
id. Add `-System DS4_100_NIIF` to narrow it.

## What it reports

- Every document the run recorded writing, with the lifecycle stages reached
  (`created -> settled -> posted -> accrued -> valued`)
- The last recorded action, how long ago, and whether the journal ends in an
  explicit verdict or just stops
- Whether a batch lock exists for that system and whether the pid holding it is
  still **alive** — the same check `run-case.ps1` and `acquireBatchLock` do
- Whether a `results/TC-*.md` already landed near that timestamp
- A warning if any journal line was unparsable, which means the process was cut
  off mid-write

## Reading the result honestly

**This is what the run *claimed*, not a fresh read of SAP.** The journal records
what the spec believed it did. Before resuming a staged case with `-Resume`, or
re-running anything it lists, confirm the documents directly in SAP (FTR_EDIT /
display).

**A live lock means stop.** If it reports a lock whose pid is ALIVE, do not
start another run of that batch — a concurrent run duplicates live writes. That
is not hypothetical: on 2026-08-18 a process the tooling reported as killed had
not stopped, and a second "resume" wrote four extra deals to DS4/100.

**A missing or stale lock proves nothing on its own.** A reboot leaves a lock
looking stale regardless of whether the last write landed.

**Always ask the user before resuming or re-running.** Running this script makes
the question *informed* — it does not replace asking. That is a standing rule in
this workspace, not a judgment call.

## Then what

- Resuming a staged case: `scripts\run-case.ps1 -Case TC-nnn -Resume <doc>` picks
  up an existing document instead of creating a second one.
- If a run died and left no record, do not reconstruct one from memory. Report
  what the journal shows and what it does not (rule 6 — never invent a result).

Full background: `docs/unattended-runs.md` § Recovering from an interrupted run.
