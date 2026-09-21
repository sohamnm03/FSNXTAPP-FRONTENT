# GitHub Copilot — repository instructions

**The rules for this workspace live in [`AGENTS.md`](../AGENTS.md). Read it first and follow
it in full.** This file used to be a byte-identical copy of it, and the copy drifted out of
date; it is deliberately a pointer now so there is only one place to edit.

`AGENTS.md` is canonical for every agent working here. It covers the target system, the four
standing agreements (lessons ledger, per-activity worklog, `ZFS_TRM_MSG` messages, never
create text elements), MCP server routing, naming, testing, and what is out of scope.

## The short version

- **There is no ABAP source in this repository.** Objects live on SAP S/4HANA `DS4` client
  `100` and are reached over MCP. Nothing here builds, lints or tests locally.
- Target is **S/4HANA on-prem in the ABAP Cloud development model** — released APIs only.
  Not BTP ABAP Environment.
- Every object name is validated against `docs/naming-conventions.md` **before** creation,
  with a `NAMING:` line in the report. All custom objects start with `ZFS`.
- **No `$TMP`, no throwaway tier, and no helper/runner/scratch objects nobody asked for.**
  If a task can't be done with the requested objects, stop and report what is blocked.
- Messages come from `ZFS_TRM_MSG` (`docs/message-catalog/<system-id>.md`, one file per
  system) — never a text symbol, never
  a literal. Text elements are otherwise reported for the human to maintain, not created —
  the one exception is the `sap-gui` script in `docs/sap-gui-object-automation.md`.
- MCP routing is per object: `adt-mcp` creates, `mcp-abap-abap-adt-api` changes and reads,
  `sap-gui` drives screens — plus that same script for text elements and transaction codes.
- Read `lessons/lessons-ledger.md` before planning a build. It outranks the examples in
  `docs/` when the two disagree.

## Language rules

Path-scoped rule sets for ABAP, CDS and BDEF files are in `.github/instructions/`:
`clean-abap.instructions.md`, `abap-cloud-rap.instructions.md`,
`zfs-naming.instructions.md`. Reusable task prompts are in `.github/prompts/`.

Where those files and `AGENTS.md` disagree, `AGENTS.md` wins.
