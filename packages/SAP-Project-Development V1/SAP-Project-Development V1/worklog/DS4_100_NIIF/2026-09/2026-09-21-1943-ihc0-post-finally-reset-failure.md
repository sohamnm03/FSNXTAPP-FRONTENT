# IHC0 — "Post finally" on external orders: reset of the provisional BCA items fails

- **Date:** 2026-09-21
- **Started:** 19:43
- **System:** DS4_100_NIIF
- **Package:** — (no repository object; BCA customizing only)
- **Transport:** none yet — the fix is **blocked**, see Todo 8
- **Requested by:** Karthik (screenshot `IHC0 Post finally Error.png`, "fix it")

## Scope

Diagnose and fix the IHC0 failure in the screenshot: bank area `S001`, payment order
`S001/0100000181/2026` (EXTCT1, AUD 107.00), status *Provisionally Posted* with **Locked** and
**Error** set. "Post finally" returns

```
I  Payment order S001/0100000181/2026 is being checked
I  No error was found
E  IHC 034  Reset of payment order S001 0100000181 2026 was terminated
E  IHC 299  Payment order S001/0100000181/2026 was not posted finally
```

In scope: root cause and the customizing correction. Out of scope: any repository object (none is
needed), and the internal-payment path (`ICCCT1`/`ICCDD1`/`MANDD1`), which posts finally in one
step and is unaffected.

This is **not** the 2026-09-19 defect (`IHC 298`, no outbound PAYEXT IDoc, ALE/WE20 chain — see
`2026-09-19-1631-ihc0-external-payment-post-failure.md`). That one is fixed: orders 151, 152, 171,
173 and 174 reached *Finally Posted* with outbound IDocs. This is the next failure in the chain,
introduced when the posting attribute was switched.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Was `FLG_TMPPOST = 'P'` for `EXTCT1`/`EXTCT2` a deliberate design decision (provisional posting on TEMP accounts until the bank confirms), or a test toggle? It was changed between 20:31 and 21:04 on 2026-09-20 | **Deliberate.** Provisional TEMP posting is the intended design, so Option A (close the `TBKKIAUTH` gap) is the fix and Option B (revert to `F`) is off the table | 2026-09-21 |
| 2 | Approve the `TBKKIAUTH` entry for bank area `S001` (Todo 8) and name the customizing request | Approved ("yes go ahead"); request not yet created — the write is still blocked, see Todo 8a | 2026-09-21 |

## Naming gate

No object is created. The fix is one row in an SAP customizing table (`TBKKIAUTH`), so no
`docs/naming-conventions.md` row applies.

## Root cause

Traced through the standard code, then proved live.

**1 — What changed.** `IHC_TAB_TRN_ATTR` (view `IHC_V_TRANS_ATTR`) now carries, for bank area
`S001`:

| UNIT | TRANSACTION_TYPE | FLG_TMPPOST | FLG_EXDOC_TMPPST |
|---|---|---|---|
| S001 | **EXTCT1** | **P** (provisional / TEMP) | X |
| S001 | **EXTCT2** | **P** | X |
| S001 | ICCCT1 / ICCCT2 / ICCDD1 / ICCDD2 / MANCT1 / MANDD1 | F (final) | — |
| S001 | ROBOCT | P | — |

The switch happened between order 100000174 (20.09 20:31, action `AMSPOST` → `BCA_POSTED` → *Finally
Posted*) and 100000175 (20.09 21:04, action `AMSPPPOST` → `PREPOSTED` → *Provisionally Posted*).
`IHC_DB_PN_STATUS` shows the action name changing at exactly that point; value dates, amounts and
transaction type are identical on both sides, so nothing but the customizing differs.

Every `EXTCT1` order since then is stuck: 175, 176, 177, 178, 181, 182 — all `LAST_GUI_STATUS = D2`,
`ERROR = 'X'`.

**2 — What the provisional path then does.** SLG1, object `IHC`, external ID
`S001/0100000181/2026` (log 00000000000000089281):

```
Transaction type EXTCT1 was transferred with posting attribute TEMP
*--- Provisional Posting: External payment order
Posting was made to account TEMP9808AUD00 instead of payer account S010AUD980800 in AUD
L/N account TEMP9800AUD00 for clearing partner S001 FI in AUD is used for posting
Document BCA */S001/000000000325/ was created
Document BCA */S001/000000000326/ was created
A payment request (IDoc 0000000000004827) was sent to system DS4CLG100
Payment order S001/0100000181/2026 was provisionally posted
Payment items S001 000000000325 read for reset
Payment items S001 000000000326 read for reset
*++++: REVERSALS IN ACCOUNT MANAGEMENT SYSTEM
E  Reset of item S001/000000000325 in the account management system failed   (IHC 228)
E  Reset of item S001/000000000326 in the account management system failed   (IHC 228)
```

Both BCA items are real postings on the TEMP accounts (`BKKIT`, `ITEMSTATUS = 03` "Posted",
`XREVERSE` blank). Final posting = reverse those two TEMP items, then repost on the real accounts —
and the reversal is what fails.

**3 — The call chain.**

```
IHC_CL_PROC_PN->FINAL_POST
  status = BCA_PREPOSTED
  -> IHC_CL_PROC_CL->PN_AMS_REWIND( i_settlemnt_cat = PUB_CON_PRELIMINARY )
       -> REVERSE_PAYMITEM_FROM_STATUS
            -> IHC_BCA_PAYM_ITEM_REVERSE           e_return = '02'  -> IHC 228 per item
       catch -> IHC 034  "Reset of payment order ... was terminated"
  catch -> IHC 299  "... was not posted finally"
```

`IHC_BCA_PAYM_ITEM_REVERSE` (FG `IHC_PROC_BCA`) returns `'02'` at its first exit:

```abap
CALL FUNCTION 'BKK_PAYM_ITEM_AUTH_CHECK_MULT'
  EXPORTING i_actvt = '85'  "reverse"
            i_msg_handler = 'X'
  IMPORTING e_number_no_auth = l_number_no_auth
  TABLES    t_bkkit = l_tab_bkkit_all.
IF l_number_no_auth > 0.
  e_return = '02'.
  RETURN.
ENDIF.
```

`REVERSE_PAYMITEM_FROM_STATUS` **discards** `e_tab_return` (BAPIRET2) and `e_tab_xcheck`, and only
reads the BCA message table after a *successful* call, so the real reason never reaches the IHC log.
That is why the payment order's Logs tab shows nothing but IHC 228/034/299.

**4 — Why the authorization check fails.** `BKK_PAYM_ITEM_AUTH_CHECK_MULT` calls
`BKK_PAYM_ITEM_AUTH_AMOUNT`, which reads `TBKKIAUTH` with a three-step fallback:

```abap
DO 3 TIMES.
  SELECT * FROM TBKKIAUTH INTO TABLE G_TBKKIAUTH
     WHERE BKKRS = L_BKKRS AND PRODINT = L_PRODINT AND TRNSTYPE = L_TRNSTYPE.
  IF SY-SUBRC EQ 0. EXIT. ENDIF.
  CASE SY-INDEX.
    WHEN 1. CLEAR L_TRNSTYPE.
    WHEN 2. CLEAR L_PRODINT.
    WHEN 3. L_NO_CUSTOMIZING = 'X'.
  ENDCASE.
ENDDO.
IF NOT L_NO_CUSTOMIZING IS INITIAL. RAISE NO_CUSTOMIZING. ENDIF.
```

`TBKKIAUTH` on DS4/100 holds **exactly one row**, and it is for the wrong bank area:

| BKKRS | PRODINT | TRNSTYPE | AUTH_GRP | AMOUNT | XCONTROL |
|---|---|---|---|---|---|
| `IHC` | — | — | A1 | 999,999,999,999 | — |

There is no row for `S001`, so all three passes miss, `NO_CUSTOMIZING` is raised, the caller lands
in `WHEN OTHERS` and issues `1P 176`, the item is not added to `t_bkkit_allowed`, and
`e_number_no_auth > 0`. `TBKKOAUTH` (payment orders) has the same single `IHC`-only row.

**Proved live, independently of IHC:** transaction **F9IG** (Reverse Payment Item), bank area
`S001`, document `325`, executed as `FS_DEV3` →

```
E 1P 176  No authorization to Reverse from Payment Item
```

`FS_DEV3` and `FS_DEV` both hold **SAP_ALL** (`UST04`), so this cannot be a role gap — it is the
missing customizing surfacing as an authorization message.

**Why this never bit before:** nothing in the internal-payment path or in the old `FLG_TMPPOST = 'F'`
external path ever reverses a payment item. The reset step only exists for provisional (TEMP)
posting, so the gap in `TBKKIAUTH` was invisible until `EXTCT1` was switched to `P` on 20.09.

## The fix

**Option A (recommended) — close the real gap.** `F9ITAUTH` ("BCA: Amount Authorization for Item",
view `V_TBKKIAUTH`) → New Entries, mirroring the existing `IHC` row:

```
Bank area      S001
Product        (blank)
Trans. type    (blank)
Auth. group    A1
Amount         999.999.999.999
Control        (unchecked)
```

`TBKKIAUTH` is delivery class `C`, so this goes on a customizing request. With one row of
999,999,999,999 and an item amount of 107 AUD the function returns `E_RETURN = 0` (allowed, no dual
control) — same behaviour the `IHC` bank area already has. `AUTH_GRP` is then checked against
`F_PAIT_GRP` (`ACTVT` 85 / `BEGRU` A1), which SAP_ALL covers.

Then re-run "Post finally" on 100000181 and the other stuck orders (175–178, 182).

**Prerequisite discovered while applying it (2026-09-21 ~19:50).** `V_TBKKIAUTH` validates
`AUTH_GRP` against `TBKKAUTGRP` for authorization **object** `PYMNT_ITEM`, and rejects the row with

```
E 1N 006  Authorization group PYMNT_ITEM not defined in Customizing (trans. F9AUTH)
```

`TBKKAUTGRP` on DS4/100 holds four rows, **all for object `PRODUCT`** (BANK, CPD, INT, MAX) — none
for `PYMNT_ITEM`. `TBKKAUTGRPOBJ` does list `PYMNT_ITEM` as a valid object, so only the group is
missing. The pre-existing `TBKKIAUTH` row for bank area `IHC` references `A1`, which is therefore
not defined either — it predates this check or was imported. So the fix is **two** customizing
steps, in this order:

```
1. F9AUTH   New Entries -> Object PYMNT_ITEM | Auth. group A1 | Description "IHC Payment Items"
2. F9ITAUTH New Entries -> S001 | product blank | trans. type blank | A1 | 999.999.999.999 | control unchecked
```

Both are delivery class `C` and go on the same customizing request. Step 1 also makes the existing
`IHC` row valid.

**Option B — revert the posting attribute.** Set `EXTCT1`/`EXTCT2` `FLG_TMPPOST` back to `F` in
`IHC_V_TRANS_ATTR` and clear `FLG_EXDOC_TMPPST`. External orders then post finally in one step, as
174 did. This restores a known-good state but **changes business behaviour** — no provisional TEMP
posting, no reset step — so it is only right if the `P` switch was a test toggle (open question 1).
It also leaves orders 175–182 stuck, because they are already preposted and still need a reset.

Option A is the fix; Option B is a rollback.

## Todo

- [x] 1. Reproduce from the screenshot; read the popup (IHC 034 / IHC 299)
- [x] 2. Pull the payment order state from `IHC_DB_PN` / `IHC_DB_PN_STATUS`
- [x] 3. Compare a working order (174, `AMSPOST`) with a broken one (175, `AMSPPPOST`)
- [x] 4. Read the real errors from SLG1 (object `IHC`, ext. ID `S001/0100000181/2026`) — IHC 228
- [x] 5. Trace `FINAL_POST` → `PN_AMS_REWIND` → `REVERSE_PAYMITEM_FROM_STATUS` → `IHC_BCA_PAYM_ITEM_REVERSE`
- [x] 6. Find the `TBKKIAUTH` gap in `BKK_PAYM_ITEM_AUTH_AMOUNT`; confirm only a `BKKRS = 'IHC'` row exists
- [x] 7. Prove it live and outside IHC: F9IG on `S001`/325 → `1P 176` under SAP_ALL
- [x] 8. Human confirmed the `P` switch was deliberate and approved the fix — Option A it is
- [x] 8a. `F9ITAUTH` New Entries, row `S001` / — / — / `A1` / 999.999.999.999 entered; Enter
      returned `1N 006` (see Prerequisite above). Cancelled with **F12 -> Yes**, nothing saved
- [ ] 8b. **BLOCKED** — `F9AUTH` New Entries (define group `A1` for object `PYMNT_ITEM`): the
      permission classifier refused the button press, reason *Permission Grant*. Backed out with
      **F3**, nothing saved. `TBKKAUTGRP` and `TBKKIAUTH` are both unchanged.
- [ ] 9. Re-run "Post finally" on `S001/0100000181/2026`; expect *Finally Posted* + two reversal
      documents + two new BCA documents on the real accounts
- [ ] 10. Clear the remaining stuck orders 175, 176, 177, 178, 182 once 181 is proved
- [ ] 11. Answer open question 1 and, if `P` was a test toggle, decide between Option A and B

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `TBKKAUTGRP` row `PYMNT_ITEM` / `A1` | Customizing data (class C) | — | not yet created | **blocked — prerequisite, not applied** |
| `TBKKIAUTH` row `S001` / — / — / A1 / 999999999999 | Customizing data (class C) | — | not yet created | **blocked — not applied** |

## Delivery checks

- [x] No repository object created (rule 6 — none needed)
- [x] No text elements involved
- [x] No message created (`ZFS_TRM_MSG` untouched)
- [x] Nothing written to the system this session — F9ITAUTH cancelled (F12/Yes), F9AUTH backed out
      (F3), F9IG never saved; `TBKKIAUTH`, `TBKKAUTGRP` and `IHC_TAB_TRN_ATTR` all re-read unchanged
- [ ] Customizing change recorded on a transport
- [ ] `S001/0100000181/2026` posted, status *Finally Posted*
- [ ] Reversal + final BCA documents verified in `BKKIT`

## Evidence

Source screenshot: `~/Downloads/IHC0 Post finally Error.png` (to be copied into
`worklog/DS4_100_NIIF/2026-09/evidence/2026-09-21-1943-ihc0-post-finally-reset-failure/`).

Key reads, all reproducible:

- `SELECT ... FROM ihc_db_pn WHERE unit = 'S001' AND pn_number > '0100000150'` — the D2/D3 split
- `SELECT ... FROM ihc_db_pn_status WHERE pn_number = '0100000174' / '0100000175'` — `AMSPOST` vs `AMSPPPOST`
- `SELECT * FROM ihc_tab_trn_attr` — `FLG_TMPPOST` per transaction type
- `SELECT * FROM tbkkiauth` / `tbkkoauth` — the single `IHC` row
- `SELECT ... FROM bkkit WHERE bkkrs = 'S001' AND docno >= '000000000313'` — TEMP vs real accounts
- SLG1 log 00000000000000089281
- F9IG `S001` / 325 → `1P 176`

## Lessons raised

L-558, L-559
