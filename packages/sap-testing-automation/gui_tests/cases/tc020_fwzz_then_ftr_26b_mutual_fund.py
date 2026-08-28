"""
TC-020 — FWZZ create a Class (26B) then FTR_CREATE a deal against it, SAP GUI
for Windows.

The executable copy of
`test-cases/GUI-TC/TC-020-FWZZ-26B-then-FTR_CREATE-mutual-fund-gui.md`.

GUI-lane sibling of TC-019 (web lane, WebGUI/ITS). Same business question,
same mock data, different rendering path — the two are not interchangeable
as evidence. Reuses TC-018's proven FWZZ functions in
`gui_tests/modules/securities.py` (three live classes: 300023, 300026,
300027-via-manual-discovery) for the class half; the FTR_CREATE half is new,
discovered live on this lane 2026-08-20 and found to share the *exact* same
program (`SAPLTTM_UI_FRAMEWORK`) and the same Enter/Save/Enter commit quirk
as the web lane's TC-019 — see `save_mutual_fund_deal`'s docstring.

Every id this case relies on came from live discovery, not the web lane's
DOM ids (CLAUDE.md rule 4):

  - Company code `9990` is the one the requester picked, confirmed live on
    the web lane (`9800`/`1000` both refuse product type 26B outright); not
    re-tried independently on this lane since it is master data, not a
    rendering-path fact.
  - The FTR_CREATE entry screen carries a "Security Class" field
    (`FTR_ENTRY-RANL`) for 26B, the identical finding the web lane made for
    22B and 26B alike.
  - Check (F6) on the 26B deal screen reports "No payment details entered
    for transaction" (message class FTR0, number 030, type W) — a WARNING,
    but a bare Save press does not commit past it. The sequence that
    actually commits is **Enter, Save, Enter**: the confirmation ("Financial
    transaction saved under number 23000143", message T1 033) appeared only
    after the *second* Enter, and the screen navigates back to FTR_ENTRY at
    that point.
"""
from __future__ import annotations

from ..modules.securities import (
    ClassData,
    MutualFundDealSpec,
    check_class,
    check_mutual_fund_deal,
    fill_basic_data,
    fill_create_dialog,
    fill_mutual_fund_deal,
    open_class_entry,
    open_create_dialog,
    open_mutual_fund_deal_entry,
    press_create_confirm,
    save_class,
    save_mutual_fund_deal,
)
from ..session import GuiSession

CASE_ID = "TC-020"

#: Mirrors TC-019's (web lane) baseline exactly, so the two lanes are
#: comparing the same business input through different rendering paths.
CLASS_DATA = ClassData(
    product_type="26B",
    short_name="NIIF BAL ADV",
    long_name="NIIF Balanced Advantage Fund - Growth",
    issuer="700000453",
    issue_currency="INR",
    issue_start_date="20.08.2026",
    nominal_value="100000",
)

DEAL_SPEC = MutualFundDealSpec(
    company_code="9990",
    transaction_type="100",
    partner="400000003",
    securities_account="1000",
    general_valuation_class_key="5",  # 'Short Term'
    number_of_units="1000",
    price="100",
)

#: In order. A run stops after the stage it was asked for. Every stage before
#: `deal-save` writes **nothing**, which makes them the harness smoke test.
STAGES = (
    "class-entry", "class-dialog", "class-basic", "class-save",
    "deal-entry", "deal-fill", "deal-save",
)
DEFAULT_STAGE = "deal-save"

#: What each stage writes, named before it runs — CLAUDE.md rule 3. The
#: runner prints these and waits for a yes.
WRITES = {
    "class-save": "FWZZ Save — creates one new Class, product type 26B "
                  "(Inv: Mutual Funds), server-assigned id.",
    "deal-save": "FTR_CREATE Save — creates one Investment transaction "
                 "(26B/100) against that class, in company code 9990.",
}


def writes_for(stage: str) -> list[str]:
    """Every database write a run up to *stage* will make."""
    limit = STAGES.index(stage)
    return [text for name, text in WRITES.items() if STAGES.index(name) <= limit]


def run(sap: GuiSession, stage: str = DEFAULT_STAGE, deal_number: str | None = None) -> str | None:
    """
    Drive the case. Returns the deal number, if Save was reached.

    `deal_number` is accepted for signature compatibility with the runner's
    `--resume`, but this case creates a class and a deal from scratch every
    time — there is no later stage to resume into. Passing one is refused
    rather than silently ignored.
    """
    if stage not in STAGES:
        raise ValueError(f"Unknown stage {stage!r}. Known: {', '.join(STAGES)}")
    reached = STAGES.index(stage)
    journal = sap.journal

    if deal_number:
        raise SystemExit(
            f"TC-020 always creates a fresh class and deal, so there is nothing to "
            f"resume against {deal_number}. Re-running without --resume creates a "
            f"second class and deal, which may be what you want; confirm the first "
            f"one's state with scripts/check-run.ps1 -Latest before deciding."
        )

    journal.meta("Stage", stage)
    journal.meta("Class data", f"{CLASS_DATA.product_type}, issuer {CLASS_DATA.issuer}, "
                               f"currency {CLASS_DATA.issue_currency}")
    journal.meta("Deal spec", f"co.code {DEAL_SPEC.company_code}, txn type "
                              f"{DEAL_SPEC.transaction_type}, partner {DEAL_SPEC.partner}")

    # ================================================================ FWZZ
    open_class_entry(sap)
    if reached < STAGES.index("class-dialog"):
        journal.step("Stopped after the entry screen, as asked — nothing written", "skipped")
        return None

    open_create_dialog(sap)
    fill_create_dialog(sap, CLASS_DATA)
    if reached < STAGES.index("class-basic"):
        journal.step("Stopped before Create (F5), as asked — nothing written", "skipped")
        return None

    press_create_confirm(sap)
    fill_basic_data(sap, CLASS_DATA)
    check_class(sap)
    if reached < STAGES.index("class-save"):
        journal.step("Stopped before Save, as asked — nothing written", "skipped")
        return None

    # ======================================================= WRITE 1: class
    class_id = save_class(sap, CLASS_DATA).number
    if reached < STAGES.index("deal-entry"):
        journal.step("Stopped after the class, as asked — nothing further written", "skipped")
        return class_id

    # ========================================================= FTR_CREATE
    open_mutual_fund_deal_entry(sap, class_id, DEAL_SPEC)
    if reached < STAGES.index("deal-fill"):
        journal.step("Stopped before the deal screen is filled, as asked — nothing further written", "skipped")
        return class_id

    fill_mutual_fund_deal(sap, DEAL_SPEC)
    check_mutual_fund_deal(sap)
    if reached < STAGES.index("deal-save"):
        journal.step("Stopped before Save, as asked — nothing further written", "skipped")
        return class_id

    # ======================================================== WRITE 2: deal
    deal_no = save_mutual_fund_deal(sap)
    journal.step(f"--- class {class_id}, deal {deal_no} ---", "ok")
    return deal_no
