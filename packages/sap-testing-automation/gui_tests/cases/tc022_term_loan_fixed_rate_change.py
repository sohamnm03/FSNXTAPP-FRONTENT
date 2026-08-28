"""
TC-022 — term loan with FIXED interest (8%, On Last Day of Month), a second
interest condition added mid-create (9% effective 20.08.2026), through
settlement, TBB1 posting, month-end accrual (TPM44) and valuation (TPM1), in
the GUI lane.

Combines TC-014's fixed-rate lifecycle (`fill_term_loan`, `settle_deal`,
`post_flows`, `run_accrual_deferral`, `run_valuation`) with one genuinely new
piece: `add_interest_condition` (`gui_tests/modules/treasury.py`), discovered
live on DS4/100, 2026-08-24, while building this case. Neither TC-014, TC-015,
TC-016, nor TC-021 ever set the Frequency dropdown on a Fixed-rate deal or
touched the 'Conditions' screen — both are new to this case, not reused from
an existing one.

Stages, resume semantics and the confirm-before-write flow mirror TC-014 and
TC-021, since the back half of this case *is* TC-014's back half applied to a
different deal.
"""
from __future__ import annotations

from ..modules.treasury import (
    DealData,
    InterestConditionChange,
    TpmData,
    add_interest_condition,
    fill_term_loan,
    open_deal_entry,
    post_flows,
    run_accrual_deferral,
    run_valuation,
    save_deal,
    settle_deal,
)
from ..session import GuiSession

CASE_ID = "TC-022"

#: Same profile as TC-014/TC-021 (co.code 1000, product 22A, txn type 100,
#: partner 700000453, INR, Short Term). Frequency is set separately below —
#: `DealData` carries the base rate only, unchanged from TC-014's shape.
BASELINE = DealData(
    company_code="1000",
    product_type="22A",
    transaction_type="100",
    partner="700000453",
    amount="100000",
    term_start="01.01.2026",
    term_end="31.12.2026",
    interest_rate="8",
    contract_date="01.01.2026",
    general_valuation_class="Short Term",
    currency="INR",
)

#: 'On Last Day of Month' (key 2) — the requester's "monthly interest with
#: month end interest": interest is calculated and due on the calendar
#: month-end, not merely once a month on the term's own anniversary date
#: ('Monthly', key 3, is a different, mutually exclusive entry — confirmed
#: with the requester 2026-08-24 before touching SAP). TPM44/TPM1 valuing at
#: month-end (below) is unrelated to this choice and would apply either way.
FREQUENCY = "On Last Day of Month"
FREQUENCY_KEY = "2"

#: The second interest condition — a rate change mid-term, added during the
#: same unsaved create via `add_interest_condition` (Conditions -> Copy
#: condition on the Nominal interest structure). `schedule_date` is the new
#: item's own calculation/due 1st date: 20.08.2026's next month-end, matching
#: the base condition's month-end convention (the requester confirmed the
#: condition may be added at creation time rather than via a later FTR_EDIT
#: change, 2026-08-24).
CONDITION_CHANGE = InterestConditionChange(
    effective_from="20.08.2026",
    rate="9",
    schedule_date="31.08.2026",
    month_end=True,
)

#: Key date is the month-end of the term start (01.01.2026 -> 31.01.2026),
#: same rule TC-014/TC-021 apply — one month only, not iterated further. The
#: second interest condition (effective 20.08.2026) postdates this key date,
#: so it plays no part in this run's accrual/valuation — this case proves the
#: two-condition structure round-trips through Save, not that the later
#: condition affects month 1.
TPM = TpmData(
    valuation_area="001",
    valuation_class="0005",
    key_date="31.01.2026",
    valuation_category="Mid-Year Valuation with Reset",
)

TBB1_DUE_DATE = "01.01.2026"
TBB1_POSTING_DATE = "01.01.2026"

#: In order. A run stops after the stage it was asked for. 'condition' writes
#: nothing — it edits the still-open, unsaved Create screen.
STAGES = ("entry", "fill", "condition", "save", "settle", "post", "tpm44", "tpm1")
DEFAULT_STAGE = "tpm1"

#: What each stage writes, named before it runs — CLAUDE.md rule 3. The runner
#: prints these and waits for a yes.
WRITES = {
    "save": "FTR_CREATE Save — creates an interest rate instrument with fixed "
            "interest (8%, On Last Day of Month) plus a second interest "
            "condition (9% effective 20.08.2026)",
    "settle": "FTR_EDIT Settle + Save — settles it",
    "post": "TBB1 with Test Run off — posts its due flows",
    "tpm44": "TPM44 with Test Run off — posts accrual/deferral at the key date",
    "tpm1": "TPM1 with Test Run off — posts the valuation at the key date",
}


def writes_for(stage: str, resume: bool = False) -> list[str]:
    """Every database write a run up to *stage* will make."""
    limit = STAGES.index(stage)
    skip = {"save"} if resume else set()
    return [text for name, text in WRITES.items()
            if STAGES.index(name) <= limit and name not in skip]


def run(sap: GuiSession, stage: str = DEFAULT_STAGE, deal_number: str | None = None,
        data: DealData = BASELINE, condition: InterestConditionChange = CONDITION_CHANGE,
        tpm: TpmData = TPM) -> str | None:
    """
    Drive the case. Returns the deal number, if one exists by the end.

    `deal_number` resumes against an existing deal instead of creating
    another — the recovery path for a run that died after the create, same
    convention as TC-014/TC-021.
    """
    if stage not in STAGES:
        raise ValueError(f"Unknown stage {stage!r}. Known: {', '.join(STAGES)}")
    reached = STAGES.index(stage)
    journal = sap.journal
    journal.meta("Stage", stage)
    journal.meta(
        "Data",
        f"{data.company_code} / {data.product_type} / {data.transaction_type} / "
        f"{data.amount} {data.currency} fixed @ {data.interest_rate}% "
        f"({FREQUENCY}) / {data.term_start}-{data.term_end}, "
        f"2nd condition {condition.rate}% eff. {condition.effective_from}",
    )
    journal.meta("Key date", tpm.key_date)

    if deal_number:
        journal.meta("Resumed against deal", deal_number)
        journal.step(f"Resuming against existing deal {deal_number} — "
                     f"FTR_CREATE skipped, no second deal created", "skipped")
        journal.document("Interest rate instrument (created by an earlier run)",
                         deal_number, data.company_code, [],
                         note="pre-existing; this run resumed against it")
    else:
        open_deal_entry(sap, data)
        if reached < STAGES.index("fill"):
            return None

        fill_term_loan(sap, data, frequency=FREQUENCY, frequency_key=FREQUENCY_KEY)
        if reached < STAGES.index("condition"):
            journal.step("Stopped before the interest condition change, as asked — "
                         "nothing written", "skipped")
            return None

        add_interest_condition(sap, condition)
        if reached < STAGES.index("save"):
            journal.step("Stopped before the save, as asked — nothing written", "skipped")
            return None

        deal_number = save_deal(sap, data).number

    if reached < STAGES.index("settle"):
        return deal_number

    settle_deal(sap, deal_number, data.company_code)
    if reached < STAGES.index("post"):
        return deal_number

    post_flows(sap, deal_number, data.company_code, TBB1_DUE_DATE, TBB1_POSTING_DATE)
    if reached < STAGES.index("tpm44"):
        return deal_number

    run_accrual_deferral(sap, deal_number, data.company_code, tpm)
    if reached < STAGES.index("tpm1"):
        return deal_number

    run_valuation(sap, deal_number, data.company_code, tpm)
    return deal_number
