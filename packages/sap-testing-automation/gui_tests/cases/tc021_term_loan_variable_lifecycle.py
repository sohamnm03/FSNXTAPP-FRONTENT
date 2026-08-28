"""
TC-021 — term loan with VARIABLE interest (RBI_REPO, monthly), through
settlement, TBB1 posting, month-end accrual (TPM44) and valuation (TPM1), in
the GUI lane.

Combines two pieces that already exist in `gui_tests/modules/treasury.py` and
were each proven separately: TC-015's variable-interest deal screen fill
(`fill_term_loan_variable` + `VariableRateTerms`) and TC-014's
settle -> TBB1 -> TPM44 -> TPM1 lifecycle (`settle_deal`, `post_flows`,
`run_accrual_deferral`, `run_valuation`). Neither TC-014 (fixed interest) nor
TC-015 (variable, create-only) covers this combination — this case exists
because nobody had asked for both at once until now. Nothing in `treasury.py`
changed to support it.

Stages, resume semantics and the confirm-before-write flow all mirror TC-014
exactly, since the back half of this case *is* TC-014's back half applied to a
different deal.
"""
from __future__ import annotations

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

CASE_ID = "TC-021"

#: Same profile as TC-014/TC-015 (co.code 1000, product 22A, txn type 100,
#: partner 700000453, INR, Short Term). `interest_rate` is unused for a
#: variable deal — the nominal-rate field is removed from the screen entirely
#: once Interest Cat. is Variable — kept blank rather than omitted so
#: `DealData` stays the one shape both fixed- and variable-rate cases share.
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

#: `RBI_REPO` is a data decision, not a discoverable default — TC-015 chose it
#: from the field's own live F4 list (16 codes on DS4, 2026-08-19) for this
#: exact profile, since the request that produced this case did not name a
#: reference rate either. Reused rather than re-decided; change it here if a
#: different rate is intended.
TERMS = VariableRateTerms(
    reference_interest_rate="RBI_REPO",
    frequency="Monthly",
    frequency_key="3",
)

#: Key date is the month-end of the term start (01.01.2026 -> 31.01.2026),
#: same rule TC-014 applies — one month only, not iterated further.
TPM = TpmData(
    valuation_area="001",
    valuation_class="0005",
    key_date="31.01.2026",
    valuation_category="Mid-Year Valuation with Reset",
)

TBB1_DUE_DATE = "01.01.2026"
TBB1_POSTING_DATE = "01.01.2026"

#: In order. A run stops after the stage it was asked for.
STAGES = ("entry", "fill", "save", "settle", "post", "tpm44", "tpm1")
DEFAULT_STAGE = "tpm1"

#: What each stage writes, named before it runs — CLAUDE.md rule 3. The runner
#: prints these and waits for a yes.
WRITES = {
    "save": "FTR_CREATE Save — creates an interest rate instrument with "
            "variable interest (RBI_REPO, monthly)",
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
        data: DealData = BASELINE, terms: VariableRateTerms = TERMS,
        tpm: TpmData = TPM) -> str | None:
    """
    Drive the case. Returns the deal number, if one exists by the end.

    `deal_number` resumes against an existing deal instead of creating
    another — the recovery path for a run that died after the create, same
    convention as TC-014.
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
    journal.meta("Key date", tpm.key_date)

    if deal_number:
        journal.meta("Resumed against deal", deal_number)
        journal.step(f"Resuming against existing deal {deal_number} — "
                     f"FTR_CREATE skipped, no second deal created", "skipped")
        # The create entry that carries the document's type lives in the
        # earlier run's journal, not this one — see TC-014 for the same note.
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
    if reached < STAGES.index("tpm44"):
        return deal_number

    run_accrual_deferral(sap, deal_number, data.company_code, tpm)
    if reached < STAGES.index("tpm1"):
        return deal_number

    run_valuation(sap, deal_number, data.company_code, tpm)
    return deal_number
