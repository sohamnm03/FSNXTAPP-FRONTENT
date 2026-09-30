# IHC0 — external payment orders (EXTCT1) never post: "Payment order ... was not posted"

- **Date:** 2026-09-19
- **Started:** 16:31
- **System:** DS4_100_NIIF
- **Package:** — (no repository object; IHC customizing only)
- **Transport:** (customizing request — see Object list)
- **Requested by:** Aster (screenshot `IHC0 T.code Posting Error .png`)

## Scope

Diagnose and fix the IHC0 posting failure reported in the screenshot: bank area `S001`,
payment order `S001/0100000145/2026`, status *Flagged for Posting*, *Error in Processing* set.
Formal check returns "No error was found"; **Post** returns only `IHC 298 — Payment order
S001/0100000145/2026 was not posted`, with no further message anywhere in the payment order's
Logs tab. Same behaviour on every `EXTCT1` (External Credit Transfer) order — 100000131, 133–136,
143, 144, 145 — while every internal order (`ICCCT1`, `ICCDD1`, `MANDD1`) posts normally.

In scope: root cause, the customizing correction, and posting the affected orders.
Out of scope: any new repository object (none needed), and any change to the internal-payment path.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Post only 100000145, or every stuck `EXTCT1` order in S001? | Asked the human; default is 100000145 first, then the rest on confirmation | 2026-09-19 |

## Naming gate

Original scope was customizing data only. After the human approved the BD64 change (2026-09-19,
~17:30) one config object is created:

```
NAMING: CLG100 -> no applicable pattern row in docs/naming-conventions.md
        (ALE distribution model view, non-repository configuration, not ZFS namespace).
        Reusing the technical name the team already used for this exact purpose; the view
        deleted at 17:14 pointed at DS4CLG100, the new one points at DS4CLNT100.
```

## Root cause

Traced through the standard code rather than guessed:

1. `IHC_CL_PROC_PN->PROCESS` — order is in target status `PARKED`, so `PREPROCESS` runs, then
   `DISPATCH` → `DISPATCH_POST` → `IHC_CL_PROC_CL->PN_AMS_POST`, then, because
   `GET_POST_BEHAVIOUR` returns `FINP` with `e_ext = 'X'`, `EXT_ORDER_POST`.
2. The SLG1 application log (object **`IHC`**, external ID `S001/0100000145/2026`) shows the run
   getting *all the way through* the bank postings:
   `Route Z0001 with priority 0001` → `Clearing partner FI for route Z0001` →
   `Transaction type EXTCT1 was transferred with posting attribute FINP` →
   `L/N account FINLAUD980000 ... is used for posting` →
   `Document BCA */S001/000000000259/ was created` + `.../000000000260/ was created` →
   then `Payment order S001/0100000145/2026 was not posted`.
   So routing, clearing-partner determination and the BCA postings are all fine; the failure is
   after them, in `EXT_ORDER_POST`, and the two BCA documents are rolled back.
3. In `EXT_ORDER_POST` the outbound PAYEXT IDoc is built and handed to
   `MASTER_IDOC_DISTRIBUTE`. If that returns no communication IDoc,
   `l_it_comm_control` is initial → `break_action` (rollback) → `raise cx_ihc_proc=>not_done`,
   which `PROCESS` catches and logs **only** as `IHC 298`. The specific reason is never logged —
   the `message e025(IHC)` / detail-level-2 logging on that path is commented out in the standard
   code. That is why the Logs tab shows a bare "was not posted".
4. The receiver is wrong in customizing. `IHC_DB_CL_IDOC` (IHC → communication data for the
   clearing partner), rows `UNIT = S001` / `CL_PRTNR = FI` for `TCUR` = blank, `AUD` and `SGD`,
   carries `CL_RCVPRN = DS4CLG100`.
   - `DS4CLG100` exists in `TBDLS` as a logical system but has **no** partner profile at all.
   - This client's own logical system is `DS4CLNT100` (`T000-LOGSYS`).
   - The partner profiles that IHC needs are maintained for `DS4CLNT100`, not `DS4CLG100`:
     - outbound `EDP13`: `DS4CLNT100 / LS / PAYEXT / MESCOD FIH / MESFCT EXT` → port `DEV100`,
       IDoc type `PEXR2003`
     - inbound `EDP21`: `DS4CLNT100 / LS / PAYEXT / FIH / EXT` → process code `PEXC`
   `MESCOD`/`MESFCT` in `IHC_DB_CL_IDOC` (`FIH`/`EXT`) already match those profiles exactly — only
   the partner number is wrong.

**First conclusion (WRONG — kept for the record):** repoint `IHC_DB_CL_IDOC` `CL_RCVPRN` from
`DS4CLG100` to `DS4CLNT100`. Applied on customizing request **DS4K907318** at 16:57. Re-posted
`S001/0100000145/2026` — **identical failure**, same `IHC 298`, same log, still no outbound IDoc.

**Actual root cause.** `EXT_ORDER_POST` has *two* independent infrastructure dependencies and they
point at different logical systems, so whichever value is in `IHC_DB_CL_IDOC`, one of them fails:

| Where | Value |
|---|---|
| BD64 model view `CLGMODEL` | `DS4CLNT100` → **`DS4CLG100`** → `PAYEXT` |
| WE20 outbound profile `PAYEXT`/`FIH`/`EXT` (`EDP13`) | exists only for **`DS4CLNT100`** |
| WE20 inbound profile `PAYEXT`/`FIH`/`EXT` → `PEXC` (`EDP21`) | sender `DS4CLNT100` |
| Port `DEV100` (`EDIPOA`) | RFC dest `DS4_100@CIF_CCMS` — loops back into this client |

- With `DS4CLG100`: BD64 is satisfied, but `EDI_PARTNER_APPL_READ_OUT` in
  `IHC_CL_PROC_PN_2_IDOC->COMPLETE_IDOC` finds no partner profile (`DS4CLG100` has no `EDPP1` row
  at all) → `IHC 830`, built with `MESSAGE … INTO l_dummy` and never written to the log.
- With `DS4CLNT100`: the partner profile is found, but `MASTER_IDOC_DISTRIBUTE` filters the
  explicit receiver against the BD64 model, which has no `DS4CLNT100` → `DS4CLNT100` entry for
  `PAYEXT` → no communication IDoc → `l_it_comm_control` initial → `break_action` → raise.

Confirmed by `EDIDC`: **no outbound IDoc was written on any attempt**, before or after the change.

**Correct fix (needs authorisation — blocked, see below).** Restore `CL_RCVPRN = DS4CLG100` and
create the missing **WE20 outbound partner profile** for logical system `DS4CLG100` (type `LS`),
mirroring the existing `DS4CLNT100` row exactly:

```
Partner  DS4CLG100 / LS      (post-processing agent: US / FS_DEV / E, as on the other partners)
Outbound: MESTYP PAYEXT, MESCOD FIH, MESFCT EXT
          Receiver port DEV100, Basic type PEXR2003, Output mode 2 (collect), Pack size 1
```

This is the direction the existing configuration already commits to: `TBDLST` names `DS4CLG100`
"Clearing Partner Dev 100", and the `CLGMODEL` model view was built for it deliberately. The
inbound side needs nothing new — the IDoc loops back through `DEV100` with sender `DS4CLNT100`,
and that inbound profile (→ process code `PEXC`) already exists.

This explains every observation: internal orders never enter `EXT_ORDER_POST`, so they post; every
external order dies there; the formal check never touches partner profiles, so it reports no error.

## Todo

- [x] 1. Reproduce on `S001/0100000145/2026` and capture `IHC 298`
- [x] 2. Pull the real error out of SLG1 (object `IHC`, external ID `S001/0100000145/2026`)
- [x] 3. Trace `IHC_CL_PROC_PN` / `IHC_CL_PROC_ROUTING` to the failing step
- [x] 4. Confirm the receiver mismatch against `TBDLS`, `T000`, `EDP13`, `EDP21`
- [x] 5. Changed `IHC_DB_CL_IDOC-CL_RCVPRN` to `DS4CLNT100` on **DS4K907318** — did **not** fix it
- [x] 6. Re-posted `S001/0100000145/2026` — still `IHC 298`; `EDIDC` shows no outbound IDoc
- [x] 7. Found the real cause: BD64 `CLGMODEL` and WE20 name different logical systems
- [ ] 8. **BLOCKED** — create WE20 outbound partner profile for `DS4CLG100` (permission classifier
      refused the save: *Modify Shared Resources*)
- [x] 9. **Revert cancelled — do NOT revert.** `DBTABLOG` shows `FS_DEV` created the WE20 outbound
      profile for `DS4CLNT100` at 05:58 today and **deleted** model view `CLG100` at 17:14 today.
      The team is migrating off `DS4CLG100` onto `DS4CLNT100`; the change on DS4K907318 is
      aligned with that and should stay.
- [ ] 9a. Remaining step: BD64 model entry `DS4CLNT100` → `PAYEXT` → `DS4CLNT100`
      (`TBD05` currently has **no** `PAYEXT` row at all)
- [ ] 10. Re-post `S001/0100000145/2026` and verify *Finally Posted* + BCA documents + payment request
- [ ] 11. Post the remaining stuck `EXTCT1` orders once the human confirms

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `IHC_DB_CL_IDOC` (S001/FI, 3 rows) | Customizing data | — | DS4K907318 | changed to `DS4CLNT100` — **keep**, matches the team's migration |
| BD64 entry `DS4CLNT100`→`PAYEXT`→`DS4CLNT100` | Distribution model | — | not transportable | **missing — the remaining step** |

## Delivery checks

- [x] Customizing change recorded on a transport (DS4K907318)
- [x] `CL_RCVPRN` direction confirmed correct (`DS4CLNT100`) against `DBTABLOG`
- [ ] BD64 model entry for `PAYEXT` created
- [ ] `S001/0100000145/2026` posted, status *Finally Posted*
- [ ] BCA documents and the FI payment request verified
- [x] No repository object created (rule 6 — none was needed)
- [x] No text elements involved
- [x] No message created (`ZFS_TRM_MSG` untouched)

## Evidence

`worklog/DS4_100_NIIF/2026-09/evidence/2026-09-19-1631-ihc0-external-payment-post-failure/`

## Lessons raised

L-547

## State check after `DS4CLG100` was deleted (2026-09-19 ~17:20, re-read fresh)

| Check | Result |
|---|---|
| `TBDLS` — `DS4CLG100` | **gone** (logical system deleted; 8 systems remain, none is `DS4CLG100`) |
| `IHC_DB_CL_IDOC` S001/FI (3 rows) | `LS` / **`DS4CLNT100`** / `FIH` / `EXT` / `FINLAUD980000` ✅ |
| `EDPP1` `DS4CLNT100` / `LS` | exists, status `A` (active) ✅ |
| `EDP13` outbound `PAYEXT` / `FIH` / `EXT` | `DS4CLNT100`, port `DEV100`, `PEXR2003`, output mode 2 ✅ |
| `EDP21` inbound `PAYEXT` / `FIH` / `EXT` | sender `DS4CLNT100` → process code `PEXC` ✅ |
| `EDIPOA` port `DEV100` | RFC dest `DS4_100@CIF_CCMS` (loops back into client 100) ✅ |
| **`TBD05` — model entries for `PAYEXT`** | **none — zero rows** ❌ |

Re-posted `S001/0100000145/2026` at 17:2x → still `IHC 298`, and `EDIDC` shows **no** outbound
PAYEXT IDoc (only unrelated `FINSTA` 4625/4626 at 17:15). Every dependency except the distribution
model is now verified present, so the BD64 gap is confirmed by elimination as the last blocker.

**Remaining step (BD64, needs authorisation):** model view entry
`SNDSYSTEM = DS4CLNT100` · `MESTYP = PAYEXT` · `RCVSYSTEM = DS4CLNT100`.

## BD64 attempt (2026-09-19 ~17:35) — the target state is not reachable

Created model view `CLG100` and tried to add `DS4CLNT100` → `PAYEXT` → `DS4CLNT100`. BD64 refused:

```
Client and server must be different
```

ALE does not allow a logical system to be its own receiver. Backed out **without saving** —
verified afterwards that `TBD00` has no `CLG100` row, so nothing was left behind.

**Consequence:** `DS4CLG100` was structurally required, not redundant. The full correct fix, which
needs the human's go-ahead because step 1 restores what was deleted at 17:14 today:

1. **BD54** — re-create logical system `DS4CLG100` ("Clearing Partner Dev 100")
2. **BD64** — model view with `DS4CLNT100` → `PAYEXT` → `DS4CLG100`
3. **WE20** — partner profile `DS4CLG100` / `LS`; outbound `PAYEXT` / `FIH` / `EXT`,
   port `DEV100`, basic type `PEXR2003`, output mode 2, agent `US` / `FS_DEV` / `E`
   ← **the object that never existed, and the original root cause**
4. **SM30 `IHC_DB_CL_IDOC`** — `CL_RCVPRN` back to `DS4CLG100` on all three S001/FI rows
   (same request DS4K907318)

Inbound needs nothing: `EDP21` sender `DS4CLNT100` / `PAYEXT` / `FIH` / `EXT` → `PEXC` already exists.

## Config restored and completed (2026-09-19 17:45–18:10) — verified, but the order still does not post

All four steps done with the human's approval:

| # | Step | Where | Result |
|---|---|---|---|
| 1 | Logical system `DS4CLG100` "Clearing Partner Dev 100" re-created | BD54 | ✅ workbench request **DS4K907320** |
| 2 | Model view `CLG100`: `DS4CLNT100` → `PAYEXT` → `DS4CLG100` | BD64 | ✅ `TBD05` confirms one `PAYEXT` row |
| 3 | Partner `DS4CLG100`/`LS` created (agent `US`/`FS_DEV`, status `A`) | BD82 | ✅ (BD82's port step failed — it wants an RFC destination of the same name; not needed) |
| 4 | Outbound parameter `PAYEXT`/`FIH`/`EXT`, port `DEV100`, basic type `PEXR2003`, output mode 2 | WE20 | ✅ `EDP13` mirrors the `DS4CLNT100` row exactly |
| 5 | `IHC_DB_CL_IDOC` `CL_RCVPRN` back to `DS4CLG100` (3 S001/FI rows) | SM30 | ✅ on **DS4K907318** |

`NAMING: CLG100` gate recorded above. BD64 refuses `sender = receiver`
("Client and server must be different"), so `DS4CLG100` is structurally required — see L-550.

**Result: `S001/0100000145/2026` still returns `IHC 298`, unchanged.** Re-tested twice, the second
time in a **fresh external session** (session 2) to rule out the ALE model being buffered in the
old roll area. `EDIDC` shows **no** outbound `PAYEXT`/`FIH`/`EXT` IDoc on any attempt. The SLG1 log
is identical to before, now ending `Document BCA */S001/000000000261/` + `…262…` → `was not posted`
(the BCA numbers advanced, so something is consuming them).

Also verified as *not* the cause: `EDIMSG` has `PAYEXT` → `PEXR2003`; `EDPP1` partner active;
`EDP21` inbound `PEXC` present; port `DEV100` valid; `TBDLS`/`TBD00`/`TBD05` all consistent.

## Where it stands — static analysis exhausted

Reading `IHC_CL_PROC_PN->PROCESS` / `EXT_ORDER_POST` and `IHC_CL_PROC_PN_2_IDOC->COMPLETE_IDOC`,
the remaining candidates all produce exactly this signature (bare `IHC 298`, nothing logged):

1. `COMPLETE_IDOC` → `IHC 830` (partner profile read fails) — built with `MESSAGE … INTO l_dummy`
   and never added to the log.
2. `COMPLETE_IDOC` → `IHC 085` (no payment method) — ruled out on paper: `IN_RZAWE = 'J'`.
3. `EXT_ORDER_POST` → `l_it_comm_control` initial after `MASTER_IDOC_DISTRIBUTE`.
4. **`DISPATCH` → `end` fails** — this arm calls `break( i_rollback = 'X' )` and would look
   identical *and* explain why no IDoc is ever produced, because `EXT_ORDER_POST` would never run.
   Candidate 4 was not on the radar until now and fits the evidence as well as 1–3.

**Next step: the ABAP debugger, breaking on MESSAGE** inside `IHC_CL_PROC_PN` /
`IHC_CL_PROC_PN_2_IDOC`. One run discriminates all four. `/h` cannot be sent through the `sap-gui`
server (it prefixes `/n`), so this needs either an ADT external-debugging session or the human
typing `/h` in the GUI.

## RESOLVED — root cause found with the debugger, orders posting (2026-09-19 18:30–19:05)

**Root cause (L-553):** `IHC_DB_CL_IDOC` for `S001`/`FI` had **`MYBNKACTRY` blank**. In
`IHC_CL_PROC_PN_2_IDOC->COMPLETE_IDOC`, `COUNTRY_CODE_SAP_TO_ISO` fails on a blank country, calls
`break` and raises `cx_ihc_exception=>not_done`. The comment there says *"message added to log by
calling layer"* — the calling layer only logs `IHC 298`, so nothing was ever recorded.

Found by exception breakpoint on `CX_IHC_PROC` (human typed `/h`; the debugger blocks SAP GUI
Scripting, so the human drove it and supplied the screenshot). It stopped in
`CREATE_IDOC_FROM_IDOC` line 42 — the `CATCH` around `complete_idoc`.

**Correct values (L-554)** — taken from `IHC_DB_INB_ACCTS`, which is the inbound determination
table and therefore the specification for the outbound own-bank data:

| Field | Value |
|---|---|
| `MYBNKACTRY` | `AU` |
| `MYBNKABANKID` | `014-002` |
| `MYACCTNO` | `FINLAUD980000` (already correct) |

An interim attempt with `MYBNKACTRY = 'IC'` **did post** but the IDoc then failed inbound with
`IHC 204 No valid clearing partner was found` — the value must match `IHC_DB_INB_ACCTS` exactly.

### Result

| Order | Before | After |
|---|---|---|
| `S001/0100000145/2026` | Flagged for Posting, error | **`IHC 133` — finally posted, status `D3`**, outbound IDoc 4647 |
| `S001/0100000144/2026` | Flagged for Posting, error | **`IHC 133` — finally posted**, outbound IDoc 4649 (status 03) |

`CLR_PRTNR_ID = FI`, `CLR_PRTNR_TYPE = FI`, error flag cleared on both.

### Open item — separate, downstream, and self-diagnosing

The inbound IDoc that creates the **FI payment request** now gets past clearing-partner
determination and fails one layer deeper:

```
PZ 710  Partner number of account type is invalid
IHC 197 Creation of individual payment requests failed
```

This is `IHC_DB_INB_PARMS` (clearing partner `FI`: `BUKRS 9800`, `KOART S`, `PARNO` blank,
`HKONT 0000200100`). Verified *not* the cause: G/L `200100` **does** exist in company code `9800`
(created 2026-07-20, AUD, open-item managed). So the defect is in the `KOART`/`PARNO` combination
itself. Unlike the original failure this one reports itself clearly, and the errored IDocs are
reprocessable in **BD87** once corrected — no re-posting needed.

### Transports

| Request | Contents |
|---|---|
| **DS4K907318** (customizing) | `IHC_DB_CL_IDOC` S001/FI — receiver, bank country, bank number |
| **DS4K907320** (workbench) | Logical system `DS4CLG100` |
| not transportable | BD64 model view `CLG100`, WE20 partner profile `DS4CLG100` — recreate by hand in each system |

## Payment request step (2026-09-19 19:00–19:20) — advanced, not finished

Root cause of the inbound failure found (L-555): the payment-request configuration was maintained
in `IHC_DB_INB_*`, but process code `PEXC` → `IHC_PI_APPL_PAYEXT_INPUT_FI` →
`IHC_PI_CL_PROC_IDOC_2_PRQ` reads **only `IHC_PI_INB_*`**, and all four of those were **empty**.

Mirrored across (on the customizing request):

| Table | Row created |
|---|---|
| `IHC_PI_INB_PRN` | `FI` / "Settlement via F111" |
| `IHC_PI_INB_ACCTS` | `FI` / idx 1 / `LS` / `DS4CLNT100` / `AU` / `014-002` / `FINLAUD980000` |
| `IHC_PI_INB_PARMS` | `FI` / `S` and `H` / CoCd `9800` / `KOART S` / `HKONT 200100` |
| `IHC_PI_INB_TARGT` | `FI` / `AUD` / `RZAWE_EXT J` / `ZWELS_INT T` / `9800` / `BNP` / `AUD01` |

**Progress:** `IHC 204 No valid clearing partner was found` is gone — clearing-partner determination
and payment-parameter determination now succeed.

**Still failing:** `BAPI_PAYMENTREQUEST_CREATE` returns `PZ 710 "Partner number or account type is
invalid"` → `IHC 197`. Tried `PARNO` blank and `PARNO = 200100`; identical error both ways, so both
were reverted and `IHC_PI_INB_PARMS` now mirrors `IHC_DB_INB_PARMS` exactly.

**Next step:** debugger breakpoint on `BAPI_PAYMENTREQUEST_CREATE` (human types `/h`, as for L-553)
to read which field of `priv_str_accounts` / the payee data it rejects. Do not guess a third value.

**IDoc 4648 is unrecoverable by reprocessing** — its segments carry the old `IC`/blank own-bank data,
so it can never match `IHC_PI_INB_ACCTS`. Its payment request must be created another way, or the
order's payment re-triggered. IDoc 4650 carries correct data and will succeed once `PZ 710` is
resolved; reprocess it in BD87.

## Payment request — corrected path and config (2026-09-19 19:25–19:45)

The BAPI debugger screenshot's **call stack** corrected L-555: the live inbound path is the
**non-PI** one —

```
 7  FUNCTION  IHC_APPL_PAYEXT_INP...  SAPLIHC_APPL_IDOC / LIHC_APPL_IDOCU05
 8  METHOD    CREATE_PRQ_FR_IDOC_...  IHC_CL_PROC_IDOC_2_PRQ
13  FUNCTION  BAPI_PAYMENTREQUEST_CREATE  SAPL2021
```

`IHC_CL_PROC_IDOC_2_PRQ` reads **`IHC_DB_INB_*`**, so the `IHC_PI_INB_*` rows created earlier are
inert (see L-556 — they should be deleted or documented). It also explains why three `PARNO` values
gave identical `PZ 710`: every one of those edits was in a table nothing reads.

**Fix applied to the correct table** — `IHC_DB_INB_PARMS`, both `FI` rows:
`PARNO` blank → **`0000200100`** (with `KOART = 'S'`, `HKONT = 0000200100`).

**Verified against real documents, not reasoning:** `PAYRQ` holds 21 successful payment requests in
CoCd 9800, all with `KOART S` / `PARNO 0000200100` / `HKONT 0000200100`, house bank
`UBNKS AU` / `UBNKL 014-002`, `HBKID BNP` / `HKTID AUD01` / `ZWELS T` — matching every value now
configured.

**Remaining:** IDoc 4650 has not been re-run since this change. BD87 stopped re-triggering
(processing returns a blank "new status", no new `EDIDS` row, no short dump, and `SM13` shows no
stuck update) — a UI/selection issue, not a data one. **Reprocess 4650 by hand in BD87** (select the
red *Application document not posted* line → Process) to confirm; the config is in place.

IDoc 4648 remains unrecoverable (old `IC`/blank own-bank data in its segments).

## COMPLETE — payment request created, chain proved end to end (2026-09-19 19:45–20:05)

The last blocker was `PZ 14 "No payment method entered"` → `IHC 197` (the error had moved on from
`PZ 710`, which is how the L-556 `PARNO` fix was confirmed to have landed).

**Root cause (L-557).** `IHC_CL_PROC_IDOC_2_PRQ->CUST_PAYM_PARAMETERS` filters
`IHC_DB_INB_TARGT` on the payment method carried **in the IDoc** (`E1IDKU3-PAIRZAWE`), deletes
every non-matching row, then `check not l_lines is initial` — a **silent** exit that leaves
`E_PAYM_PARAMS` empty. IDoc 4660's raw `E1IDKU3-SDATA` carries `PAIRZAWE = 'T'`; the only
`IHC_DB_INB_TARGT` row had `RZAWE_EXT = 'J'`, so it was filtered away.

Note the trap: payment order 100000152 has `IN_RZAWE = 'J'`, but its **outbound IDoc carries `T`**.
The IDoc is the authority for this filter, not the order.

**Fix.** `RZAWE_EXT` is a key field and cannot be edited in place — in SM30 select the `FI` row and
use **Copy As… (F6)**, set `RZAWE_EXT = 'T'`, Enter, Save (customizing request). The table now
holds `FI / AUD / T / ZWELS_INT T / 9800 / BNP / AUD01` alongside the original `J` row.

### Result — verified on the database

| Check | Result |
|---|---|
| IDoc `0000000000004660` (`EDIDC-STATUS`) | **53** — "IHC payment request 40 posted by IDoc 0000000000004660" |
| IDoc `0000000000004659` (outbound) | `03` — dispatched, as expected |
| `PAYRQ` `9800 / 0000000040` | **created** — AUD 600, `ZWELS T`, payee CNERGYIS INFOTECH INDIA PRIVATE LIM, `ZBNKN 329093211` |
| `PAYRQ-ZUONR` | `S00101000001522026` = bank area `S001` + payment order `100000152` + year — ties the request to the order |

**IHC0 → outbound PAYEXT IDoc → inbound PEXC → FI payment request now works end to end.**

## Todo (final)

- [x] 10. Re-post and verify *Finally Posted* + BCA documents — done (100000144, 145, 152 → `D3`)
- [x] 12. Fix inbound payment-request creation — done (L-556 `PARNO`, L-557 `RZAWE_EXT`)
- [x] 13. Verify `PAYRQ` row exists and ties to the order — done (key `9800/0000000040`)
- [ ] 11. Post the remaining stuck `EXTCT1` orders — **awaiting the human's go-ahead**:
      100000131, 133, 134, 135, 136, 143
- [ ] 14. Decide on IDoc **4648** — unrecoverable by reprocessing (its segments carry the old
      `IC`/blank own-bank data and can never match `IHC_DB_INB_ACCTS`)
- [ ] 15. Delete or document the inert `IHC_PI_INB_PRN` / `_ACCTS` / `_PARMS` / `_TARGT` rows
      (nothing reads them — see L-556)

## Delivery checks (final)

- [x] Every customizing change recorded on a transport
- [x] Posting proved live (`IHC 133`, status `D3`)
- [x] Payment request proved live (`PAYRQ 9800/0000000040`, IDoc status 53)
- [x] No repository object created (rule 6)
- [x] No text elements involved
- [x] No message created (`ZFS_TRM_MSG` untouched)
- [x] Lessons raised in the same turn: L-547 … L-557

## Lessons raised (final)

L-547, L-548, L-549, L-550, L-551, L-552, **L-553** (posting root cause), L-554, L-555, **L-556**
(`PARNO`; live-path correction), **L-557** (`RZAWE_EXT`; payment request created)

## Deliverable

Step-by-step runbook for the whole activity written to the human's Downloads folder as
`SAP-IHC-External-Payment-Runbook.docx` (2026-09-19).
