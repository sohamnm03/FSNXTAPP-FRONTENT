# SAP GUI direct-automation scripts — tcode creation + service publishing

- **Date:** 2026-08-22
- **System:** DS4_100_NIIF
- **Package:** n/a (tooling, not an ABAP object)
- **Transport:** n/a
- **Requested by:** Saumya S (saumya.s@fourthsignal.com)

## Scope

Following the L-229 policy exception (sap-gui automation for text elements/tcodes) and repeated
human feedback that per-field MCP tool-call latency was too slow, built two standalone Python
scripts that import `mcp_sap_gui.sap_controller.SAPGUIController` directly — no MCP protocol layer,
no per-step model round trip — mirroring `D:\SAP Tool\SAP-Testing-Automation\gui_tests\session.py`'s
architecture:

1. `scripts/sap-gui-create-tcode.py` — SE93 report-transaction creation (supersedes the manual
   Script 1 steps table used for `ZFS_XA_USRREC`/`1`/`2`/`3`).
2. `scripts/sap-gui-publish-service.py` — `/IWFND/V4_ADMIN` service-group publishing (supersedes the
   manual GUI flow in L-220).

Out of scope: a general-purpose "run any tcode" script — both scripts are hardcoded to their one
named transaction each (L-231), since bypassing the MCP protocol layer also bypasses whatever
blocklist it enforces, and the vendored `mcp_sap_gui` package has none of its own.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Which unpublished `Z*` service group to use for the live verification of the publish script | `ZFS_SB_MATERIAL_O4_API` (human-selected from 6 real candidates) | 2026-08-22 |

## Naming gate

Not applicable — no new named ABAP objects created by this activity (the tcodes were created and
named in the prior activity's worklog; this activity is the automation tooling and one real publish
of a pre-existing, already-named service group).

## Todo

- [x] 1. Discover and verify the SE93 flow live (4 manual creations: `ZFS_XA_USRREC`/`1`/`2`/`3`)
- [x] 2. Confirm the MCP-layer transaction blocklist is NOT present in the vendored `mcp_sap_gui`
      package (grepped, zero matches) — scope both scripts to one hardcoded transaction each (L-231)
- [x] 3. Build + dry-validate `scripts/sap-gui-create-tcode.py`
- [x] 4. Run it live for `ZFS_XA_USRREC4` — one process call, `"ok": true`
- [x] 5. Discover the `/IWFND/V4_ADMIN` publish flow live (tree/grid structure, `Publish Service
      Groups` app-toolbar button, ALV `PUBLISH` button, confirmation + result popups)
- [x] 6. Build `scripts/sap-gui-publish-service.py`
- [x] 7. Publish `ZFS_SB_MATERIAL_O4_API` live (human-selected target) — confirmed via re-query, no
      longer in the unpublished list
- [x] 8. Dry-run the publish script's lookup mode against the now-published group — confirms clean
- [x] 9. Document both scripts in `docs/sap-gui-object-automation.md`, ledger entries L-231/L-232
- [x] 10. Publish `ZAPI_TRAVEL_A2_O4` (human-requested) — script crashed *after* the confirm button
      had already fired (`get_screen_elements()` return-type bug, see L-232 addendum); checked the
      live session by hand (found the unread "New service group(s) successfully published" popup
      still open), dismissed it, fixed the bug, re-verified via lookup-only mode — confirmed published

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `scripts/sap-gui-create-tcode.py` | Automation script | n/a | n/a | Done — verified live (`ZFS_XA_USRREC4`) |
| `scripts/sap-gui-publish-service.py` | Automation script | n/a | n/a | Done — verified live (`ZFS_SB_MATERIAL_O4_API`) |
| `ZFS_SB_MATERIAL_O4_API` service group | Publish action (pre-existing object, not created here) | n/a | n/a | Published — confirmed no longer in the unpublished-candidates list |
| `ZAPI_TRAVEL_A2_O4` service group | Publish action (pre-existing object, not created here) | n/a | n/a | Published — confirmed via lookup-only re-run after fixing the script bug |

## Delivery checks

- [x] Both scripts run clean from `tools/mcp-sap-gui/.venv/Scripts/python.exe`
- [x] Both scripts require `--yes` to write; without it, validate/lookup only, no SAP contact for
      naming/length checks, read-only lookup otherwise
- [x] Both scripts hardcoded to one transaction each — no parameter reaches any other tcode (L-231)
- [x] Live-verified end to end, not just dry-run
- [ ] Text symbols and selection texts maintained — n/a, no ABAP objects touched
- [x] Object list confirmed (tooling files, not transportable objects)

## Lessons raised

Entries added to `lessons/lessons-ledger.md` during this activity:
- L-231 — a direct-import script against `SAPGUIController` bypasses the MCP layer's transaction
  blocklist entirely (confirmed via grep — the vendored package has no blocklist code at all);
  both scripts hardcoded to one transaction each as the mitigation
- L-232 — `/IWFND/V4_ADMIN` publish flow frozen into `scripts/sap-gui-publish-service.py`; documented
  the "Get Service Groups" grid showing all 1046 groups until filtered, and the exact-match
  "not found or already published" popup behavior
