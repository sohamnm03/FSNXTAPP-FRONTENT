"""
TC-014 — term loan through month-end accrual and valuation, in the GUI lane.

The executable copy of `test-cases/GUI-TC/TC-014-FTR-term-loan-accrual-valuation-gui.md`.
Same business flow and the same five writes as TC-009, driven through SAP GUI
for Windows instead of WebGUI/ITS.

Stages exist so a run can stop before a write, and so an interrupted run can be
resumed against a deal that already exists rather than creating a second one —
the `-Resume` case that `run-case.ps1` supports for the web lane.

`--rows` is opt-in and additive: called with no rows (the default — nobody
passes `defaultRows` for this case in config/gui-runs.json), `run()` behaves
exactly as before and drives the single `BASELINE` deal. Passing `--rows`
instead drives one full create -> settle -> post -> TPM44 -> TPM1 lifecycle per
row of the `term-loan-accrual-valuation-batch` dataset (shared with TC-012, the
web-lane sibling that already runs the same ten rows) — same profile as
`BASELINE`, a different amount/date per row. Batch rows do not support
`--resume`: each row is its own deal, so there is no single deal number to
resume against. If a batch run dies partway, `scripts/check-run.ps1 -Latest`
shows which rows already landed; re-run with `--rows` limited to what's left
rather than the whole set, to avoid creating duplicate deals for rows already
saved.
"""
from __future__ import annotations

from ..datasets import dataset
from ..modules.treasury import (
    DealData,
    TpmData,
    fill_term_loan,
    open_deal_entry,
    post_flows,
    run_accrual_deferral,
    run_valuation,
    save_deal,
    settle_deal,
)
from ..session import GuiSession

CASE_ID = "TC-014"
DATASET = "term-loan-accrual-valuation-batch"

#: The `baseline` row, matching TC-009's dataset field for field. Kept here
#: rather than in `test-data/*.dataset.json` because nothing else reads it yet;
#: when a second GUI-lane case needs the same values, move it there.
BASELINE = DealData(
    company_code="1000",
    product_type="22A",
    transaction_type="100",
    partner="700000453",
    amount="100000",
    term_start="01.01.2026",
    term_end="31.12.2026",
    interest_rate="10",
    contract_date="01.01.2026",
    general_valuation_class="Short Term",
    currency="INR",
)

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
    "save": "FTR_CREATE Save — creates an interest rate instrument",
    "settle": "FTR_EDIT Settle + Save — settles it",
    "post": "TBB1 with Test Run off — posts its due flows",
    "tpm44": "TPM44 with Test Run off — posts accrual/deferral at the key date",
    "tpm1": "TPM1 with Test Run off — posts the valuation at the key date",
}


def _deal_data(row: dict) -> DealData:
    """A batch dataset row as the deal screen's input values."""
    return DealData(
        company_code=row["companyCode"],
        product_type=row["productType"],
        transaction_type=row["transactionType"],
        partner=row["partner"],
        amount=row["amount"],
        term_start=row["startDate"],
        term_end=row["endDate"],
        interest_rate=row["interestRate"],
        # Defaults to startDate, same rule the web lane's loadDataset applies:
        # SAP refuses the save if Contract Date is after Term Start.
        contract_date=row.get("contractDate") or row["startDate"],
        general_valuation_class=row["generalValuationClass"],
        currency=row["currency"],
    )


def _tpm(row: dict) -> TpmData:
    return TpmData(
        valuation_area=row["valuationArea"],
        valuation_class=row["valuationClass"],
        key_date=row["keyDate"],
        valuation_category=row["valuationCategory"],
    )


def writes_for(stage: str, resume: bool = False, rows: str | None = None) -> list[str]:
    """
    Every database write a run up to *stage* will make.

    `resume` drops the "save" entry by its WRITES key — the same key `run()`
    tests to decide whether to call `save_deal` at all — rather than the
    runner matching write text by string prefix, which would silently stop
    working the moment this entry's wording changes. `rows` fans this out to
    one line per row per write: the count is not fixed, and rule 3 means
    naming every one of them before any of them runs.
    """
    limit = STAGES.index(stage)
    if rows is None:
        skip = {"save"} if resume else set()
        return [text for name, text in WRITES.items()
                if STAGES.index(name) <= limit and name not in skip]
    selected = dataset(DATASET).select(rows)
    return [
        f"Row {row['id']} ({row['label']}): {text}"
        for row in selected
        for name, text in WRITES.items()
        if STAGES.index(name) <= limit
    ]


def _run_one(sap: GuiSession, reached: int, data: DealData, tpm: TpmData,
             due_date: str, posting_date: str, deal_number: str | None) -> str | None:
    """One deal through as many stages as `reached` allows. Shared by the
    single-deal path and each row of a batch run."""
    journal = sap.journal

    if deal_number:
        journal.meta("Resumed against deal", deal_number)
        journal.step(f"Resuming against existing deal {deal_number} — "
                     f"FTR_CREATE skipped, no second deal created", "skipped")
        # The create entry that carries the document's type lives in the earlier
        # run's journal, not this one, and nothing merges across runs — so a
        # resumed run's Documents table would otherwise show a blank Type against
        # a real deal number. Stated here, and marked as not created by this run.
        journal.document("Interest rate instrument (created by an earlier run)",
                         deal_number, data.company_code, [],
                         note="pre-existing; this run resumed against it")
    else:
        open_deal_entry(sap, data)
        if reached < STAGES.index("fill"):
            return None

        fill_term_loan(sap, data)
        if reached < STAGES.index("save"):
            journal.step("Stopped before the save, as asked — nothing written", "skipped")
            return None

        deal_number = save_deal(sap, data).number

    if reached < STAGES.index("settle"):
        return deal_number

    settle_deal(sap, deal_number, data.company_code)
    if reached < STAGES.index("post"):
        return deal_number

    post_flows(sap, deal_number, data.company_code, due_date, posting_date)
    if reached < STAGES.index("tpm44"):
        return deal_number

    run_accrual_deferral(sap, deal_number, data.company_code, tpm)
    if reached < STAGES.index("tpm1"):
        return deal_number

    run_valuation(sap, deal_number, data.company_code, tpm)
    return deal_number


def run(sap: GuiSession, stage: str = DEFAULT_STAGE, deal_number: str | None = None,
        data: DealData = BASELINE, tpm: TpmData = TPM, rows: str | None = None) -> str | None:
    """
    Drive the case. Returns the deal number (batch: the last row's), if one
    exists by the end.

    `deal_number` resumes against an existing deal instead of creating another —
    the recovery path for a run that died after the create. Only meaningful for
    the single-deal path: `rows` and `deal_number` together are refused, since a
    batch has no one deal to resume against.

    `rows` is additive — omit it and this runs exactly as it always has, one
    deal on `BASELINE`. Pass it to drive one row of the
    `term-loan-accrual-valuation-batch` dataset per deal instead.
    """
    if stage not in STAGES:
        raise ValueError(f"Unknown stage {stage!r}. Known: {', '.join(STAGES)}")
    reached = STAGES.index(stage)
    journal = sap.journal
    journal.meta("Stage", stage)

    if rows is None:
        journal.meta("Data", f"{data.company_code} / {data.product_type} / {data.transaction_type} / "
                             f"{data.amount} {data.currency} @ {data.interest_rate}% / "
                             f"{data.term_start}-{data.term_end}")
        journal.meta("Key date", tpm.key_date)
        return _run_one(sap, reached, data, tpm, TBB1_DUE_DATE, TBB1_POSTING_DATE, deal_number)

    if deal_number:
        raise SystemExit(
            f"TC-014 with --rows does not support --resume against a single deal "
            f"({deal_number}) — each row is its own deal. Run scripts/check-run.ps1 "
            f"-Latest to see what already landed, then re-run with --rows limited to "
            f"the rows still needed, rather than the whole set."
        )

    selected = dataset(DATASET).select(rows)
    journal.meta("Dataset", f"{DATASET} — row(s) "
                            f"{', '.join(row['id'] for row in selected)}")

    last: str | None = None
    for row in selected:
        row_data = _deal_data(row)
        row_tpm = _tpm(row)
        due_date = row.get("dueDate") or row["startDate"]
        posting_date = row.get("postingDate") or row["startDate"]
        journal.step(f"Row {row['id']} — {row['label']}", "ok")
        journal.meta(f"Row {row['id']} data",
                     f"{row_data.company_code} / {row_data.product_type} / "
                     f"{row_data.transaction_type} / {row_data.amount} {row_data.currency} "
                     f"@ {row_data.interest_rate}% / {row_data.term_start}-{row_data.term_end}, "
                     f"key date {row_tpm.key_date}")
        last = _run_one(sap, reached, row_data, row_tpm, due_date, posting_date, None)

    return last
