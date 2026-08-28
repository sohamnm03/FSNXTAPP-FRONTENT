"""
TC-023 — term loan with VARIABLE interest (RBI_REPO, monthly), through
settlement, TBB1 posting, then month-end accrual (TPM44) and valuation (TPM1)
for **every month-end across the full term** (01.2026 through 12.2026), in
the GUI lane.

Same deal profile and same create/settle/post lifecycle as TC-021
(`fill_term_loan_variable`/`VariableRateTerms` from TC-015's side,
`settle_deal`/`post_flows`/`run_accrual_deferral`/`run_valuation` from
TC-014's, all reused unchanged from `gui_tests/modules/treasury.py`). TC-021
deliberately stops after one month ("Does not cover: month 2 onward");
this case is that request answered for real — the requester asked for
TPM44/TPM1 to be run for all months of the term, not just the first, so it
gets its own case id rather than changing what TC-021 documents and proves.

Stages, resume semantics and the confirm-before-write flow mirror TC-021
through `post`; the difference starts at the final stage, `tpm`, which loops
TPM44 then TPM1 once per month-end instead of running each exactly once.
"""
from __future__ import annotations

import calendar

from ..modules.treasury import (
    DealData,
    TpmData,
    VariableRateTerms,
    fill_term_loan_variable,
    open_deal_entry,
    post_flows,
    run_accrual_deferral,
    run_valuation,
    save_deal,
    settle_deal,
)
from ..session import GuiSession

CASE_ID = "TC-023"

#: Same profile as TC-014/TC-021 (co.code 1000, product 22A, txn type 100,
#: partner 700000453, INR, Short Term). `interest_rate` is unused for a
#: variable deal — kept blank, same convention as TC-021.
BASELINE = DealData(
    company_code="1000",
    product_type="22A",
    transaction_type="100",
    partner="700000453",
    amount="100000",
    term_start="01.01.2026",
    term_end="31.12.2026",
    interest_rate="",
    contract_date="01.01.2026",
    general_valuation_class="Short Term",
    currency="INR",
)

#: Reused unchanged from TC-015/TC-021 — a data decision, not a discoverable
#: default. Change it here if a different reference rate is intended.
TERMS = VariableRateTerms(
    reference_interest_rate="RBI_REPO",
    frequency="Monthly",
    frequency_key="3",
)

TBB1_DUE_DATE = "01.01.2026"
TBB1_POSTING_DATE = "01.01.2026"

TPM_VALUATION_AREA = "001"
TPM_VALUATION_CLASS = "0005"
#: Always this value for this workspace — never asked, per prior confirmation.
TPM_VALUATION_CATEGORY = "Mid-Year Valuation with Reset"


def _month_end_dates(start: str, end: str) -> list[str]:
    """
    Every calendar month-end from *start*'s month through *end*'s month,
    inclusive, as `DD.MM.YYYY` strings — the same convention TC-014/TC-021 use
    for a single key date. `calendar.monthrange` is used rather than a
    hand-written table so a leap-year February is never a place to make a
    typo.
    """
    d, m, y = (int(p) for p in start.split("."))
    _, em, ey = (int(p) for p in end.split("."))
    dates: list[str] = []
    year, month = y, m
    while (year, month) <= (ey, em):
        last_day = calendar.monthrange(year, month)[1]
        dates.append(f"{last_day:02d}.{month:02d}.{year:04d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return dates


#: 01.2026 -> 12.2026: 31.01.2026, 28.02.2026, 31.03.2026, ..., 31.12.2026.
KEY_DATES = _month_end_dates(BASELINE.term_start, BASELINE.term_end)

#: In order. A run stops after the stage it was asked for. `tpm` is one stage
#: covering every month in `KEY_DATES` — there is no per-month stopping point,
#: the same granularity TC-014/TC-021 apply to their own single `tpm44`/`tpm1`
#: stages.
STAGES = ("entry", "fill", "save", "settle", "post", "tpm")
DEFAULT_STAGE = "tpm"


def writes_for(stage: str, resume: bool = False) -> list[str]:
    """Every database write a run up to *stage* will make, named individually."""
    if stage not in STAGES:
        raise ValueError(f"Unknown stage {stage!r}. Known: {', '.join(STAGES)}")
    limit = STAGES.index(stage)
    writes: list[str] = []
    if STAGES.index("save") <= limit and not resume:
        writes.append(
            "FTR_CREATE Save — creates an interest rate instrument with "
            "variable interest (RBI_REPO, monthly)"
        )
    if STAGES.index("settle") <= limit:
        writes.append("FTR_EDIT Settle + Save — settles it")
    if STAGES.index("post") <= limit:
        writes.append(
            f"TBB1 with Test Run off — posts its due flows "
            f"(due {TBB1_DUE_DATE} / posting {TBB1_POSTING_DATE})"
        )
    if STAGES.index("tpm") <= limit:
        for key_date in KEY_DATES:
            writes.append(f"TPM44 with Test Run off — posts accrual/deferral at key date {key_date}")
            writes.append(f"TPM1 with Test Run off — posts valuation at key date {key_date}")
    return writes


def run(sap: GuiSession, stage: str = DEFAULT_STAGE, deal_number: str | None = None,
        data: DealData = BASELINE, terms: VariableRateTerms = TERMS) -> str | None:
    """
    Drive the case. Returns the deal number, if one exists by the end.

    `deal_number` resumes against an existing deal instead of creating
    another — same convention as TC-014/TC-021. `settle_deal`, `post_flows`,
    `run_accrual_deferral` and `run_valuation` are all idempotent against
    work an earlier run already did (they detect "already settled" / "no
    flows exist" / "already run" from SAP itself), so re-running the full
    month loop on a resume is safe — it does not double-post a month that
    already went through.
    """
    if stage not in STAGES:
        raise ValueError(f"Unknown stage {stage!r}. Known: {', '.join(STAGES)}")
    reached = STAGES.index(stage)
    journal = sap.journal
    journal.meta("Stage", stage)
    journal.meta(
        "Data",
        f"{data.company_code} / {data.product_type} / {data.transaction_type} / "
        f"{data.amount} {data.currency} variable @ {terms.reference_interest_rate} "
        f"({terms.frequency}) / {data.term_start}-{data.term_end}",
    )
    journal.meta("Key dates (TPM44/TPM1, one pair per month)", ", ".join(KEY_DATES))

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

        fill_term_loan_variable(sap, data, terms)
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
    if reached < STAGES.index("tpm"):
        return deal_number

    total = len(KEY_DATES)
    for i, key_date in enumerate(KEY_DATES, start=1):
        tpm = TpmData(
            valuation_area=TPM_VALUATION_AREA,
            valuation_class=TPM_VALUATION_CLASS,
            key_date=key_date,
            valuation_category=TPM_VALUATION_CATEGORY,
        )
        journal.step(f"--- Month {i}/{total} — key date {key_date} ---", "ok")
        run_accrual_deferral(sap, deal_number, data.company_code, tpm)
        run_valuation(sap, deal_number, data.company_code, tpm)

    return deal_number
