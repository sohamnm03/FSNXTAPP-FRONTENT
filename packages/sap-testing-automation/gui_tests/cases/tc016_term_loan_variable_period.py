"""
TC-016 — FTR_CREATE variable-rate term loan, parameterised interest period.

The executable copy of
`test-cases/GUI-TC/TC-016-FTR_CREATE-term-loan-variable-period-gui.md`.

Create only, one write per row. What this case proves that TC-015 does not is
that the length of the interest period is accepted and survives a save on the
1000/22A profile — monthly, quarterly and half-yearly — and that SAP derives the
period it was given rather than a default.

It exists because the period is **not** a dropdown choice. Read live on DS4/100
on 2026-08-19, the Interest Frequency list offers only At End of Term, On First
Day of Month, On Last Day of Month, Monthly, Daily and Manual Input — no
quarterly, half-yearly or annual entry — and the adjacent unit dropdown offers
only Days and Months while reading `changeable=false`. So with `Monthly`
selected the unit is Months and the period is set by the count next to it:
1 = monthly, 3 = quarterly, 6 = half-yearly.

TC-015 stays as it is: one row, monthly, its interest period accepted as the
screen default rather than set. This case sets it, which is a different claim.
Rows live in `test-data/term-loan-variable-period.dataset.json`, so adding a
period means editing data, not this module.
"""
from __future__ import annotations

from ..datasets import dataset
from ..modules.treasury import (
    DealData,
    VariableRateTerms,
    fill_term_loan_variable,
    open_deal_entry,
    save_deal,
)
from ..session import GuiSession

CASE_ID = "TC-016"
DATASET = "term-loan-variable-period"

#: In order. `entry` and `fill` write **nothing**, so they are this case's
#: harness smoke test.
STAGES = ("entry", "fill", "save")
DEFAULT_STAGE = "save"

#: Which row runs when nobody says. One row, not `all` — a default that created
#: three deals because the caller omitted an argument is the wrong default.
DEFAULT_ROWS = "quarterly"


def _deal_data(row: dict) -> DealData:
    """A dataset row as the deal screen's input values."""
    return DealData(
        company_code=row["companyCode"],
        product_type=row["productType"],
        transaction_type=row["transactionType"],
        partner=row["partner"],
        amount=row["amount"],
        # No `PKOND` exists on a variable deal — blank so nothing here can be
        # mistaken for a rate this deal carries. The rate comes from the
        # reference rate at accrual time.
        interest_rate="",
        term_start=row["startDate"],
        term_end=row["endDate"],
        contract_date=row["contractDate"],
        general_valuation_class=row["generalValuationClass"],
        currency=row["currency"],
    )


def _terms(row: dict) -> VariableRateTerms:
    return VariableRateTerms(
        reference_interest_rate=row["referenceInterestRate"],
        frequency=row["interestFrequency"],
        frequency_key=row["interestFrequencyKey"],
        interest_category=row["interestCategory"],
        interest_category_key=row["interestCategoryKey"],
        period_count=row["periodCount"],
    )


def writes_for(stage: str, rows: str | None = None) -> list[str]:
    """
    Every database write a run up to *stage* will make, one line per row.

    Takes `rows` because the count is not fixed: three rows is three deals, and
    rule 3 means naming each one before any of them runs.
    """
    if stage != "save":
        return []
    selected = dataset(DATASET).select(rows or DEFAULT_ROWS)
    return [
        f"FTR_CREATE Save - creates one interest rate instrument "
        f"(row {row['id']}: {row['label']}). Nothing is settled or posted."
        for row in selected
    ]


def run(sap: GuiSession, stage: str = DEFAULT_STAGE, deal_number: str | None = None,
        rows: str | None = None) -> str | None:
    """
    Drive the case, one deal per selected row. Returns the last deal number.

    `deal_number` is refused: this case creates and then stops, so there is no
    later stage to resume into, and a resume that quietly did nothing would look
    like a pass.
    """
    if stage not in STAGES:
        raise ValueError(f"Unknown stage {stage!r}. Known: {', '.join(STAGES)}")
    if deal_number:
        raise SystemExit(
            f"TC-016 is create-only, so there is nothing to resume against deal "
            f"{deal_number}. Re-running creates another deal, which may be what you "
            f"want; confirm the first one's state with scripts/check-run.ps1 -Latest "
            f"before deciding."
        )

    reached = STAGES.index(stage)
    journal = sap.journal
    selected = dataset(DATASET).select(rows or DEFAULT_ROWS)

    journal.meta("Stage", stage)
    journal.meta("Dataset", f"{DATASET} — row(s) "
                            f"{', '.join(row['id'] for row in selected)}")
    journal.meta("Why the period is a count, not a frequency key",
                 "SAP's Interest Frequency dropdown has no quarterly/half-yearly entry "
                 "(read live on DS4/100, 2026-08-19) and the unit is locked to Months, "
                 "so the period is set by the count beside it")

    last: str | None = None
    for row in selected:
        data = _deal_data(row)
        terms = _terms(row)
        journal.step(f"Row {row['id']} — {row['label']}", "ok")
        journal.meta(f"Row {row['id']} interest structure",
                     f"{terms.interest_category} on {terms.reference_interest_rate}, "
                     f"{terms.frequency} every {terms.period_count} months, no spread set")

        open_deal_entry(sap, data)
        if reached < STAGES.index("fill"):
            journal.step("Stopped after the entry screen, as asked — nothing written",
                         "skipped")
            return None

        fill_term_loan_variable(sap, data, terms)
        if reached < STAGES.index("save"):
            journal.step(f"Row {row['id']}: stopped before the save, as asked — "
                         f"nothing written", "skipped")
            continue

        last = save_deal(sap, data).number

    return last
