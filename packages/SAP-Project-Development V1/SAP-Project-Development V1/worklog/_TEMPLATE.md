<!--
  Copy to worklog/<system-id>/<YYYY-MM>/<YYYY-MM-DD>-<HHmm>-<slug>.md
  e.g. worklog/DS4_100_NIIF/2026-09/2026-09-13-1430-dyngw-v2-cleanup-wave.md
  HHmm is the 24h local time the activity started -- it is what orders several
  entries on the same day, which is routine here (21 on 2026-09-08).
-->

# <Activity title>

- **Date:** YYYY-MM-DD
- **Started:** HH:MM  <!-- 24h local, matches the HHmm in this file's name -->
- **System:** DS4_100_NIIF | DS4_100_TFSIN
- **Package:** ZFS_...
- **Transport:** DS4K......
- **Requested by:** <human>

## Scope

<One paragraph: what is being built or changed, and what is explicitly out of scope.>

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | | | |

## Naming gate

Record one line per object **before** the create call
(`docs/naming-conventions.md`, L-027):

```
NAMING: <NAME> -> matches <pattern row | exception row>
```

## Todo

- [ ] 1. …
- [ ] 2. …

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| | | | | |

## Delivery checks

- [ ] Pretty Printer
- [ ] Syntax check clean
- [ ] Activated, nothing left inactive
- [ ] ATC / Code Inspector — priority 1 and 2 resolved
- [ ] ABAP Unit green (or "none applicable" with a reason)
- [ ] Text symbols and selection texts maintained
- [ ] Object list confirmed in the transport

## Evidence

Screenshots, transcripts, payload dumps and exported reports for this activity go in
`worklog/<system-id>/<YYYY-MM>/evidence/<this file's stem>/` — the folder name matches this
file's name without `.md`, so worklog and evidence pair up by name. Link them by relative
path; delete this section if the activity produced none.

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity: L-…
