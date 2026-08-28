"""
TC-015 — FTR_CREATE term loan with variable interest, in the GUI lane.

The executable copy of
`test-cases/GUI-TC/TC-015-FTR_CREATE-term-loan-variable-rate-gui.md`.

Create only, one write. Settlement and posting behave identically for any
interest structure and are already proven by TC-002 (web) and TC-014 (GUI);
repeating them here would add commits and no information. What is *not* already
proven anywhere is that the **variable** interest structure — reference rate plus
frequency — is accepted and survives a save on the 1000/22A profile, which is
the whole of this case.

GUI-lane sibling of TC-013 (web lane, WebGUI/ITS). Same data, same business
question, different rendering path — the two are not interchangeable as
evidence. Scoped from the model-driven run of 2026-08-19 that created deal
160279; every id it relies on is in `gui_tests/screens/ftr-deal-irate.json`
with the date it was discovered.
"""
from __future__ import annotations

from ..modules.treasury import (
    DealData,
    VariableRateTerms,
    fill_term_loan_variable,
    open_deal_entry,
    save_deal,
)
from ..session import GuiSession

CASE_ID = "TC-015"

#: Matches TC-013's `baseline` row and TC-014's data profile field for field,
#: except for the interest structure. Kept here rather than in
#: `test-data/*.dataset.json` for the same reason TC-014's is: nothing else reads
#: it yet. Move it there when a second case needs these values.
BASELINE = DealData(
    company_code="1000",
    product_type="22A",
    transaction_type="100",
    partner="700000453",
    amount="100000",
    #: Unused by this case, and necessarily so: `Percentage Rate` (`PKOND`) is
    #: removed from the screen when Interest Cat. becomes `Variable`. Blank
    #: rather than a number so nothing here can be mistaken for a rate this deal
    #: actually carries — the rate comes from RBI_REPO at accrual time.
    interest_rate="",
    term_start="01.01.2026",
    term_end="31.12.2026",
    #: Must be <= term start or SAP refuses the save. Today's date is the screen
    #: default and would be later than 01.01.2026, so this is set, not accepted.
    contract_date="01.01.2026",
    #: Required on this product/company combination — the field reports
    #: `required: true` while empty, with Variable interest just as with Fixed
    #: (confirmed live 2026-08-19, which settled TC-013's open question).
    general_valuation_class="Short Term",
    currency="INR",
)

#: `RBI_REPO` is a **data decision**, not a discoverable default. It was chosen
#: by the requester from this field's own live F4 list (16 codes on DS4) on
#: 2026-08-19 and accepted by SAP without error. If this case ever needs a
#: different reference rate, change it here — never in the module.
TERMS = VariableRateTerms(
    reference_interest_rate="RBI_REPO",
    frequency="Monthly",
    frequency_key="3",
    interest_category="Variable",
    interest_category_key="2",
)

#: In order. A run stops after the stage it was asked for. `entry` and `fill`
#: write **nothing**, which makes them the harness smoke test for this case.
STAGES = ("entry", "fill", "save")
DEFAULT_STAGE = "save"

#: What each stage writes, named before it runs — CLAUDE.md rule 3. The runner
#: prints these and waits for a yes.
WRITES = {
    "save": "FTR_CREATE Save — creates one interest rate instrument "
            "(term loan, variable interest on RBI_REPO, monthly). "
            "Nothing is settled or posted.",
}


def writes_for(stage: str) -> list[str]:
    """Every database write a run up to *stage* will make."""
    limit = STAGES.index(stage)
    return [text for name, text in WRITES.items() if STAGES.index(name) <= limit]


def run(sap: GuiSession, stage: str = DEFAULT_STAGE, deal_number: str | None = None,
        data: DealData = BASELINE, terms: VariableRateTerms = TERMS) -> str | None:
    """
    Drive the case. Returns the deal number, if one exists by the end.

    `deal_number` is accepted for signature compatibility with the runner's
    `--resume`, but this case creates and then stops — there is no later stage to
    resume into. Passing one is recorded and refused rather than silently
    ignored: a resume that quietly did nothing would look like a pass.
    """
    if stage not in STAGES:
        raise ValueError(f"Unknown stage {stage!r}. Known: {', '.join(STAGES)}")
    reached = STAGES.index(stage)
    journal = sap.journal

    if deal_number:
        raise SystemExit(
            f"TC-015 is create-only, so there is nothing to resume against deal "
            f"{deal_number}. Re-running without --resume creates a second deal, which "
            f"may be what you want; confirm the first one's state with "
            f"scripts/check-run.ps1 -Latest before deciding."
        )

    journal.meta("Stage", stage)
    journal.meta("Data", f"{data.company_code} / {data.product_type} / "
                         f"{data.transaction_type} / {data.amount} {data.currency} / "
                         f"{data.term_start}-{data.term_end}")
    journal.meta("Interest structure", f"{terms.interest_category} on "
                                       f"{terms.reference_interest_rate}, "
                                       f"{terms.frequency}, no spread set")

    open_deal_entry(sap, data)
    if reached < STAGES.index("fill"):
        journal.step("Stopped after the entry screen, as asked — nothing written", "skipped")
        return None

    fill_term_loan_variable(sap, data, terms)
    if reached < STAGES.index("save"):
        journal.step("Stopped before the save, as asked — nothing written", "skipped")
        return None

    doc = save_deal(sap, data)
    return doc.number
