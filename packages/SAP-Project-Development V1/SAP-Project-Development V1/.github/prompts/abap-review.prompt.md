# clean-abap:review

Review existing ABAP code against the Clean ABAP rule set in `.github/instructions/clean-abap.instructions.md` (relative to this skill's directory).

## What this command does

You are reviewing ABAP source code for compliance with the Clean ABAP rule set. Your job is to produce a **structured, prioritised review** â€” not to refactor the code (that is `/clean-abap:refactor`).

## Inputs

Accept any of the following. If none are provided, ask the user which they want.

- An ABAP object name â€” read it with `arc-1` `SAPRead`
- A package name â€” enumerate with `arc-1` `SAPRead type=DEVC` or `SAPSearch`, then review object by object
- A code block pasted into the conversation â€” always works, and is the only path when no read-capable server is connected

**Tool routing.** Read the `## Tooling` section in `.github/instructions/clean-abap.instructions.md` before the first tool call. Source reads and repository search run on **`arc-1`** â€” the official `abap-adt` server exposes neither. Optional corroboration: `abap-adt` `abap_atc_run` + `abap_atc_get_result` (fallback `arc-1` `SAPDiagnose action="atc"`) turns the ATC-checkable findings from guesses into evidence; `arc-1` `SAPLint` gives a cheap local pass on keyword case and obsolete statements. If neither server is connected, ask the user to paste the source from ADT in VS Code.

## Procedure

1. **Load the rule set.** Read every rule under `## RULE:` in `.github/instructions/clean-abap.instructions.md`. These are the only rules in scope for this review.
2. **Get the source.** If pasted inline, use it. If an object name was given, read it with `arc-1` `SAPRead` â€” for a class, `method="*"` first for the shape, then read the methods that matter, rather than pulling the whole class. If no read-capable server is connected, ask the user to paste it from ADT.
3. **Scan the source against every rule.** Record each violation with: the rule name, the exact line or block in the source, and a one-sentence diagnosis.
4. **Prioritise ATC-checkable violations first.** Rules with an `**ATC**:` line in the rule set are objectively flaggable by a tool â€” those go to the top of the report. Rules without an ATC reference are still valid findings but are lower priority. If ATC is reachable, run it on the object and mark each such finding as *confirmed by ATC* or *not raised by ATC* â€” the second case is worth stating, since it usually means the check is not in the active variant.
5. **Assign a severity to each finding** using this scale:
   - **Critical** â€” produces a runtime exception, silently corrupts data, or fails activation (e.g. catching `cx_root` and continuing, `SELECT` on an unreleased table)
   - **Major** â€” ATC-checkable Clean ABAP violation that survives activation but is unambiguous (magic numbers in conditions, methods over ~30 lines, `EXPORTING` where `RETURNING` works, `READ TABLE ... sy-subrc`)
   - **Minor** â€” Clean ABAP styleguide preference with no ATC check (long names, missing inline declaration, sub-optimal naming)
6. **Suggest a concrete fix for every finding.** Show a short Do/Avoid snippet, not a vague instruction. The fix must obey every other rule in the set â€” do not fix one violation by introducing another.
7. **Do not modify the source.** This command is read-only. If the user wants the fixes applied, point them at `/clean-abap:refactor`.

## Output format

Use this exact structure. One section per object reviewed.

```
# Clean ABAP Review â€” <OBJECT NAME>

## Critical (N)

### 1. <rule-name> â€” <one-line diagnosis>
**Location:** <file/include> line <N>
**Found:**
` ` `abap
<offending code>
` ` `
**Fix:**
` ` `abap
<concrete replacement>
` ` `

## Major (N)

(same format)

## Minor (N)

(same format)

## Summary
- Critical: N
- Major:    N
- Minor:    N
- Total:    N

## Recommended next step
<one sentence â€” usually either "run /clean-abap:refactor" or "address the criticals manually first because â€¦">
```

## Hard rules for this command

- **Cite the rule by name.** Every finding starts with `## RULE: <name>` from `CLAUDE.md`. No findings without a rule.
- **Do not invent rules.** If something feels off but is not covered by a rule in `CLAUDE.md`, mention it in a single "Out of scope observations" section at the very end â€” not in the main report.
- **Do not modify the source.** Read-only.
- **Do not skip rules to be polite.** A real review names everything; the severity scale handles the noise.
- **One report per object.** If reviewing a package, produce one report per object and a single summary table at the end with totals per object.

