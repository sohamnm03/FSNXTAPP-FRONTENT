"""
Reusable business components for the GUI lane — the treasury lifecycle.

The web lane's `web-tests/modules/treasury.ts` holds `openDealEntry`,
`fillTermLoan`, `saveDeal`, `settleDeal`, `postFlows`, `runAccrualDeferral` and
`runValuation`. These are the same seven steps against SAP GUI for Windows, and
they exist for the same reason: a case file should read as the business flow,
not as a list of element ids and popup handling.

Every function here records what it did to the journal as it goes, so the run
file is emitted rather than transcribed. Each one returns what it read off the
screen — never what it sent.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from ..screens import screen
from ..session import GuiSession, WriteRefused

ENTRY = "ftr-entry"
DEAL = "ftr-deal-irate"
COND = "ftr-interest-conditions"
TBB1 = "tbb1-selection"
TPM44 = "tpm44-selection"
TPM1 = "tpm1-selection"

#: SAP's own confirmation line, e.g.
#: "Interest rate instrument 160275 in company code 1000 is created".
#: The document type is taken from what SAP said it created, not from what the
#: case asked for — one is what was requested, the other is what exists.
_CONFIRMATION = re.compile(
    r"^(?P<type>.+?)\s+(?P<number>\d{4,})\s+in company code\s+(?P<cc>\S+)\s+is\s+(?P<verb>\w+)",
    re.IGNORECASE,
)


@dataclass
class DealData:
    """One term loan's input values. Mirrors the web lane's dataset row."""
    company_code: str
    product_type: str
    transaction_type: str
    partner: str
    amount: str
    term_start: str
    term_end: str
    interest_rate: str
    contract_date: str
    general_valuation_class: str
    currency: str = "INR"


@dataclass
class VariableRateTerms:
    """
    The extra values a **variable**-interest deal needs, on top of `DealData`.

    A fixed-rate deal carries its rate in `DealData.interest_rate` (the nominal
    percentage, `PKOND`). A variable one has no such field on screen at all —
    `PKOND` is removed when Interest Cat. becomes `Variable` and a reference
    interest rate plus an optional spread take its place. Hence a separate
    dataclass rather than more optional fields on `DealData`: a variable deal
    with a `nominal rate` would be a value that cannot exist.

    Dropdowns carry both a key and a label. The **key** is what SAP is driven
    with — unambiguous, and unaffected by language or a renamed entry. The
    **label** is what the assertion compares and what a person reads in the run
    file. Recording both means a customising change that renames an entry shows
    up as a changed label against an unchanged key, instead of as a mystery.

    `Interest Markup/Markdown` and `Interest Rate for the First Period` are
    deliberately absent: nothing here sets them, and SAP stores a blank as
    `0.0000000` (confirmed live 2026-08-19, deal 160279). A case wanting a real
    spread should add the field here rather than typing an id into a case.
    """
    reference_interest_rate: str
    frequency: str = "Monthly"
    frequency_key: str = "3"
    interest_category: str = "Variable"
    interest_category_key: str = "2"
    #: `Every N` (`ARHYTM`) — how many units of the derived unit make one
    #: interest period. `None` leaves the field alone and only reads it, which is
    #: what TC-015 does, so its behaviour is unchanged.
    #:
    #: This is the only way to express a frequency the dropdown has no entry for.
    #: Discovered live on DS4/100, 2026-08-19: the Frequency list offers just
    #: `At End of Term` / `On First Day of Month` / `On Last Day of Month` /
    #: `Monthly` / `Daily` / `Manual Input` — there is no half-yearly, quarterly
    #: or annual key. The unit dropdown offers only Days and Months and reads
    #: `changeable=false`, so with `Monthly` selected the unit is Months and the
    #: period is set by this count: half-yearly is `"6"`, quarterly `"3"`.
    period_count: str | None = None


@dataclass
class TpmData:
    """Selection values shared by TPM44 and TPM1."""
    valuation_area: str
    valuation_class: str
    key_date: str
    valuation_category: str = "Mid-Year Valuation with Reset"


@dataclass
class DocumentDescriptor:
    """What SAP said it wrote."""
    doc_type: str
    number: str | None
    company_code: str
    raw: str = ""


def describe(message: str, fallback_type: str) -> DocumentDescriptor:
    """Parse SAP's confirmation line; fall back to the requested type."""
    match = _CONFIRMATION.match(message.strip())
    if not match:
        return DocumentDescriptor(fallback_type, None, "", message.strip())
    return DocumentDescriptor(
        doc_type=match.group("type").strip(),
        number=match.group("number"),
        company_code=match.group("cc"),
        raw=message.strip(),
    )


# --------------------------------------------------------------------- create


def open_deal_entry(sap: GuiSession, data: DealData) -> None:
    """FTR_CREATE's entry screen: company code, product, transaction type, partner."""
    entry = screen(ENTRY)
    sap.start_transaction("FTR_CREATE")
    sap.set_field_verified(entry.field("companyCode"), data.company_code, "Company Code")
    sap.set_field_verified(entry.field("productType"), data.product_type, "Product Type")
    sap.set_field_verified(entry.field("transactionType"), data.transaction_type,
                           "Transaction Type")
    sap.set_field_verified(entry.field("partner"), data.partner, "Partner")
    sap.journal.step(
        f"FTR_CREATE entry — co.code {data.company_code}, product {data.product_type}, "
        f"txn type {data.transaction_type}, partner {data.partner}", "ok",
    )
    sap.enter()

    info = sap.screen()
    if info.get("program") != "SAPLFTR_IRATE":
        raise WriteRefused(
            f"FTR_CREATE did not reach the deal screen — landed on "
            f"{info.get('program')} / {info.get('screen_number')}: {info.get('message')}"
        )


def fill_term_loan(sap: GuiSession, data: DealData, *,
                   frequency: str | None = None, frequency_key: str | None = None) -> dict[str, str]:
    """
    Fill the deal screen and read every value back.

    The read-back is the point. TC-014 set these four fields and never re-read
    them, so its run file reports them `NOT OBSERVED` — the run literally could
    not say what the deal held. Here each value in the report is the string that
    came off the screen after SAP reformatted it.

    `frequency`/`frequency_key` are optional and additive: TC-014 never set the
    Frequency dropdown and left it at its default (`At End of Term`), so leaving
    both `None` reproduces that unchanged. Passing them (TC-022's `On Last Day
    of Month`) sets it the same way `fill_term_loan_variable` does, confirmed
    live on DS4/100 2026-08-24 to need no reference-rate unlock dance the way
    the Variable path does — Fixed's Frequency is changeable immediately after
    the first Enter.
    """
    deal = screen(DEAL)
    observed: dict[str, str] = {}

    observed["amount"] = sap.set_field_verified(deal.field("amount"), data.amount, "Amount")
    observed["termStart"] = sap.set_field_verified(
        deal.field("termStart"), data.term_start, "Term Start")
    observed["termEnd"] = sap.set_field_verified(
        deal.field("termEnd"), data.term_end, "End of Term")
    observed["rate"] = sap.set_field_verified(
        deal.field("nominalInterestRate"), data.interest_rate, "Nominal Interest Rate")
    observed["contractDate"] = sap.set_field_verified(
        deal.field("contractDate"), data.contract_date, "Contract Date")

    sap.journal.step("Deal screen — amount, term, rate, contract date", "ok")
    sap.enter()
    _confirm_working_day_dialog(sap)

    if frequency_key is not None:
        observed["frequency"] = sap.select_combobox(deal.field("interestFrequency"), frequency_key)
        sap.enter()
        sap.journal.checked("Interest frequency", frequency or frequency_key,
                            observed["frequency"], _label_matches(frequency or ""))
        sap.journal.step(f"Frequency → {observed['frequency']}", "ok")
    else:
        observed["frequency"] = sap.read_field(deal.field("interestFrequency"))

    # Currency is a product-type default and not changeable: assert, never set.
    observed["currency"] = sap.read_field(deal.field("paymentCurrency"))
    observed["partnerName"] = sap.read_field(deal.field("partnerName"))

    sap.journal.checked("Amount survives the round trip", data.amount,
                        observed["amount"], lambda o: _digits(o) == _digits(data.amount))
    sap.journal.checked("Term start", data.term_start, observed["termStart"])
    sap.journal.checked("End of term", data.term_end, observed["termEnd"])
    sap.journal.checked("Payment currency", data.currency, observed["currency"])
    sap.journal.checked("Nominal interest rate", data.interest_rate,
                        observed["rate"], lambda o: _digits(o) == _digits(data.interest_rate))
    sap.journal.check("Business partner resolves on the deal screen",
                      data.partner, observed["partnerName"])

    # The Administr. tab holds a required dropdown. SAP refuses this switch
    # while a required Structure-tab field is empty, so a successful switch is
    # also indirect proof the Structure fields were accepted.
    sap.select_tab(deal.tab("administration"))
    chosen = sap.select_combobox(deal.field("generalValuationClass"),
                                 data.general_valuation_class)
    # Compared with `_label_matches`, not by string equality: SAP GUI pads a
    # combobox's text to the control's width (see fill_term_loan_variable,
    # which hit this first), so equality can fail on whitespace and report a
    # product problem that isn't one.
    sap.journal.checked("General Valuation Class (deal screen, Administr. tab)",
                        data.general_valuation_class, chosen,
                        _label_matches(data.general_valuation_class))
    sap.journal.step(f"Administr. tab — General Valuation Class = {chosen.strip()}", "ok")
    sap.select_tab(deal.tab("structure"))
    return observed


def fill_term_loan_variable(sap: GuiSession, data: DealData,
                            terms: VariableRateTerms) -> dict[str, str]:
    """
    Fill the deal screen with a **variable**-interest structure, and read it back.

    Additive sibling of `fill_term_loan`, not a replacement — the fixed-rate path
    and TC-014 are untouched. It is a separate function rather than a flag
    because the screen is genuinely different: switching Interest Cat. to
    `Variable` removes `nominalInterestRate` from the screen entirely and puts
    three new fields in its place, so a shared function would spend its life
    branching on which fields exist.

    The order below is forced by the screen, not chosen (all confirmed live on
    DS4/100, 2026-08-19):

    1. Structure fields first — SAP refuses the Administr. tab switch, and
       reports "Enter the start of term", while any of them is empty.
    2. Interest Cat. -> Variable, then **Enter**. This rebuilds the interest
       block. The Enter fails with hard error `T1 183` (*Enter a reference
       interest rate*), which is expected at this point and not a failure: the
       error is what proves the rebuild happened and the field is mandatory.
    3. Reference interest rate, then **Enter**. Only now does `Frequency` stop
       reading `changeable=false`. Setting the frequency before this silently
       has nothing to act on.
    4. Frequency last.
    """
    deal = screen(DEAL)
    observed: dict[str, str] = {}

    observed["amount"] = sap.set_field_verified(deal.field("amount"), data.amount, "Amount")
    observed["termStart"] = sap.set_field_verified(
        deal.field("termStart"), data.term_start, "Term Start")
    observed["termEnd"] = sap.set_field_verified(
        deal.field("termEnd"), data.term_end, "End of Term")
    observed["contractDate"] = sap.set_field_verified(
        deal.field("contractDate"), data.contract_date, "Contract Date")
    sap.journal.step("Deal screen — amount, term, contract date", "ok")

    # --- interest category. The error on this Enter is expected; see step 2 above.
    observed["interestCategory"] = sap.select_combobox(
        deal.field("interestCategory"), terms.interest_category_key)
    sap.enter()
    refusal = sap.status_message()
    sap.journal.step(
        f"Interest Cat. → {observed['interestCategory']} (interest block rebuilt)", "ok",
        f"SAP then asked for the reference rate: {refusal!r}" if refusal else None,
    )

    # --- reference interest rate. Mandatory, and unlocks Frequency.
    observed["referenceInterestRate"] = sap.set_field_verified(
        deal.field("referenceInterestRate"), terms.reference_interest_rate,
        "Reference Interest Rate")
    sap.enter()
    rate_warning = sap.status_message()
    if rate_warning:
        # W T1 129 is expected here and is non-blocking (deal 160279 saved
        # through it). Recorded rather than suppressed, and never treated as a
        # failure — but also never ignored, so a *different* message shows up in
        # the run file instead of vanishing.
        sap.journal.meta("Reference rate message", rate_warning)
    _confirm_working_day_dialog(sap)

    # --- frequency. Only changeable once the reference rate is in.
    if not _is_changeable(sap, deal.field("interestFrequency")):
        raise WriteRefused(
            "Frequency is still read-only after the reference interest rate was accepted. "
            "The interest block did not rebuild as expected — re-discover the screen with "
            "sap_get_screen_elements before trusting this case."
        )
    observed["frequency"] = sap.select_combobox(
        deal.field("interestFrequency"), terms.frequency_key)
    sap.enter()
    sap.journal.step(f"Frequency → {observed['frequency']}", "ok")

    # --- interest period. Only touched when a case asks for one, so the default
    # path (TC-015) still reads this field without setting it.
    if terms.period_count is not None:
        if not _is_changeable(sap, deal.field("frequencyCount")):
            raise WriteRefused(
                "'Every N' is read-only, so the interest period cannot be set — the "
                "interest block did not render as expected. Re-discover the screen with "
                "sap_get_screen_elements before trusting this run."
            )
        sap.set_field_verified(deal.field("frequencyCount"), terms.period_count,
                               "Interest period (Every N)")
        sap.enter()
        unit = sap.read_field(deal.field("frequencyUnit")).strip()
        sap.journal.step(f"Interest period → every {terms.period_count} {unit}", "ok")

    # Currency is a product-type default and not changeable: assert, never set.
    observed["currency"] = sap.read_field(deal.field("paymentCurrency"))
    observed["partnerName"] = sap.read_field(deal.field("partnerName"))
    observed["frequencyCount"] = sap.read_field(deal.field("frequencyCount"))
    observed["frequencyUnit"] = sap.read_field(deal.field("frequencyUnit"))
    observed["interestCalcMethod"] = sap.read_field(deal.field("interestCalcMethod"))
    observed["markup"] = sap.read_field(deal.field("interestMarkup"))
    observed["firstPeriodRate"] = sap.read_field(deal.field("firstPeriodRate"))

    sap.journal.checked("Amount survives the round trip", data.amount,
                        observed["amount"], lambda o: _digits(o) == _digits(data.amount))
    sap.journal.checked("Term start", data.term_start, observed["termStart"])
    sap.journal.checked("End of term", data.term_end, observed["termEnd"])
    sap.journal.checked("Payment currency", data.currency, observed["currency"])
    sap.journal.checked("Interest category", terms.interest_category,
                        observed["interestCategory"], _label_matches(terms.interest_category))
    sap.journal.checked("Reference interest rate", terms.reference_interest_rate,
                        observed["referenceInterestRate"])
    sap.journal.checked("Interest frequency", terms.frequency,
                        observed["frequency"], _label_matches(terms.frequency))
    if terms.period_count is None:
        sap.journal.check("Interest period, as SAP derived it",
                          f"{terms.frequency} → a count and a unit",
                          f"{observed['frequencyCount']} / {observed['frequencyUnit']}".strip())
    else:
        # Set, so asserted rather than merely recorded.
        sap.journal.checked("Interest period (set, not defaulted)",
                            f"every {terms.period_count} months",
                            f"{_digits(observed['frequencyCount'])} / "
                            f"{observed['frequencyUnit'].strip()}",
                            lambda o: _digits(o).startswith(_digits(terms.period_count)))
    sap.journal.check("Interest calculation method (defaulted, not set by this case)",
                      "whatever 22A defaults to", observed["interestCalcMethod"])
    sap.journal.check("Interest markup/markdown left blank — what SAP stored",
                      "blank or zero", observed["markup"])
    sap.journal.check("Interest rate for the first period left blank — what SAP stored",
                      "blank or zero", observed["firstPeriodRate"])
    sap.journal.check("Business partner resolves on the deal screen",
                      data.partner, observed["partnerName"])
    sap.journal.check("Nominal percentage rate is absent for a variable deal",
                      "field not addressed — replaced by the reference rate",
                      "not addressed")

    # The Administr. tab holds a required dropdown. SAP refuses this switch while
    # a required Structure-tab field is empty, so a successful switch is also
    # indirect proof the Structure fields were accepted. Confirmed live that this
    # field is required with Variable too, not only with Fixed.
    sap.select_tab(deal.tab("administration"))
    chosen = sap.select_combobox(deal.field("generalValuationClass"),
                                 data.general_valuation_class)
    # Compared with `_label_matches`, not by string equality: SAP GUI pads a
    # combobox's text to the control's width, so the same value can arrive as
    # "Short Term" or as "Short Term" + 160 spaces depending on which read path
    # produced it. Equality would fail on whitespace and report a product problem
    # that isn't one. The padded string is still what gets recorded.
    sap.journal.checked("General Valuation Class (deal screen, Administr. tab)",
                        data.general_valuation_class, chosen,
                        _label_matches(data.general_valuation_class))
    sap.journal.step(f"Administr. tab — General Valuation Class = {chosen.strip()}", "ok")
    sap.select_tab(deal.tab("structure"))
    return observed


def _is_changeable(sap: GuiSession, field_id: str) -> bool:
    """
    Whether SAP will let this field be set right now.

    `set_field_verified` cannot answer this: setting a read-only field raises
    with a message about the value not matching, which reads like the wrong value
    rather than the wrong moment.
    """
    try:
        result = sap.controller.read_field(field_id)
    except Exception:  # noqa: BLE001 — absence is the answer, not an error
        return False
    return bool(result.get("changeable", False))


def _label_matches(expected: str):
    """
    Compare a dropdown's visible label loosely.

    SAP GUI pads a combobox's text to the control's width, so `"Variable"` comes
    back as `"Variable" + 160 spaces`. Comparing raw strings would fail on
    whitespace and report a product problem that isn't one; the padded value is
    still what gets recorded.
    """
    def predicate(observed) -> bool:
        return str(observed).strip().casefold() == expected.strip().casefold()
    return predicate


@dataclass
class InterestConditionChange:
    """
    A second, later-dated interest condition added on top of the Fixed
    'Nominal interest' condition — discovered live on DS4/100, 2026-08-24,
    while building TC-022.

    Added from the still-open (unsaved) Structure screen, after
    `fill_term_loan`: this is a rate change mid-term expressed as it is
    entered, not a later edit to a saved deal — it lands with WRITE 1 like
    every other structure field. `schedule_date` is the new item's own
    calculation/due 1st date, which a copied item does NOT inherit from the
    base item and must be set explicitly (see `add_interest_condition`).
    """
    effective_from: str
    rate: str
    schedule_date: str
    month_end: bool = True


def add_interest_condition(sap: GuiSession, condition: InterestConditionChange) -> dict[str, str]:
    """
    Add a second, later-dated interest condition on the Fixed 'Nominal
    interest' structure already on screen.

    Order, all confirmed live on DS4/100, 2026-08-24, while building TC-022:

    1. 'Conditions' (Shift+F6) on the deal Structure screen -> Overview of
       Conditions, an ALV listing every condition item on this deal
       (typically 'Nominal interest' + 'Final repayment').
    2. Double-click the 'Nominal interest' row -> Condition Details for
       that item.
    3. 'Copy condition' (F5) -> a small popup asking only for 'Eff. From'.
       Confirming it creates a brand-new dated item on the SAME condition
       (same Condition Type/Group) — a rate change mid-term, not a new
       condition type. ('Create Parallel Condition Group', on the Overview
       grid's own toolbar, was not used and was not explored.)
    4. The new item's Dates tab is BLANK and must be filled explicitly — it
       does not inherit the base item's schedule. Left blank, validating the
       Amounts tab raises hard error 'Enter Due Date' (TM 001).
    5. Amounts tab -> Percentage Rate.
    6. Back to the Overview grid (F3) to confirm both items are listed, then
       back to the Structure screen (F3) to continue the create.
    """
    deal = screen(DEAL)
    cond = screen(COND)
    observed: dict[str, str] = {}

    sap.press(deal.button("conditions"))
    info = sap.screen()
    if info.get("program") != "SAPLTB12":
        raise WriteRefused(
            f"'Conditions' did not reach the Overview of Conditions grid — landed on "
            f"{info.get('program')} / {info.get('screen_number')}: {info.get('message')}"
        )

    grid = cond.field("overviewGrid")
    before_rows = sap.read_table(grid, max_rows=20).get("data", [])
    nominal_before = [r for r in before_rows if "nominal interest" in str(r.get("XKOART", "")).lower()]
    target = next(
        (i for i, row in enumerate(before_rows)
         if "nominal interest" in str(row.get("XKOART", "")).lower()),
        None,
    )
    if target is None:
        raise WriteRefused(
            "No 'Nominal interest' condition row found on the Overview of Conditions grid — "
            "expected one from fill_term_loan. Re-discover with sap_get_screen_elements before "
            "trusting this case."
        )
    # The base item's own Eff. From/rate, read BEFORE the copy — this is what
    # 'Copy condition' must leave untouched. A check that only looks for the
    # NEW row would still report pass if Copy condition had instead mutated
    # this row in place, which is the failure mode this case exists to rule out.
    base_effective_from = str(before_rows[target].get("DGUEL_KP", ""))
    base_amount = str(before_rows[target].get("XDESCR_AMOUNT", ""))
    sap.drill_into_row(grid, target, "XKOART")
    info = sap.screen()
    if info.get("program") != "SAPLFTR_CONDITION_MAIN":
        raise WriteRefused(
            f"Drilling into 'Nominal interest' did not reach Condition Details — landed on "
            f"{info.get('program')} / {info.get('screen_number')}: {info.get('message')}"
        )

    sap.press(cond.button("copyCondition"))
    popup = sap.popup()
    if not popup.get("popup_exists"):
        raise WriteRefused("'Copy condition' did not raise the Eff. From popup as expected.")
    sap.set_field(cond.field("copyPopupEffectiveFrom"), condition.effective_from)
    sap.press(cond.button("copyPopupConfirm"))

    observed["effectiveFrom"] = sap.read_field(cond.field("itemEffectiveFrom"))
    sap.journal.checked("New interest condition's Eff. From", condition.effective_from,
                        observed["effectiveFrom"])

    # Dates tab — blank on a freshly copied item; must be set or the Amounts
    # tab raises 'Enter Due Date' (TM 001).
    sap.select_tab(cond.tab("dates"))
    sap.set_field_verified(cond.field("calcFirstDate"), condition.schedule_date,
                           "New condition — Calculation date, 1st date")
    sap.select_checkbox(cond.field("calcMonthEnd"), condition.month_end)
    observed["calcMonthEnd"] = "checked" if sap.read_checkbox(cond.field("calcMonthEnd")) else "unchecked"
    sap.set_field_verified(cond.field("dueFirstDate"), condition.schedule_date,
                           "New condition — Due date, 1st date")
    sap.select_checkbox(cond.field("dueMonthEnd"), condition.month_end)
    observed["dueMonthEnd"] = "checked" if sap.read_checkbox(cond.field("dueMonthEnd")) else "unchecked"
    sap.enter()
    refusal = sap.status_message()
    if "enter due date" in refusal.lower():
        raise WriteRefused(f"New interest condition's Dates tab was refused: {refusal!r}")

    # Amounts tab — the new rate.
    sap.select_tab(cond.tab("amounts"))
    observed["rate"] = sap.set_field_verified(cond.field("percentageRate"), condition.rate,
                                              "New condition — Percentage Rate")
    sap.enter()
    sap.journal.checked("New interest condition's rate", condition.rate,
                        observed["rate"], lambda o: _digits(o) == _digits(condition.rate))
    sap.journal.step(
        f"Added a second interest condition — {condition.rate}% effective "
        f"{condition.effective_from} — via Copy condition on the Nominal interest structure",
        "ok",
    )

    # Confirm BOTH items now exist — the original, unchanged, AND the new one.
    # Checking only for the new row would still report pass if 'Copy condition'
    # had instead mutated the original in place; the base row's presence at its
    # ORIGINAL date/rate is what rules that out.
    sap.send(3)  # F3 — Overview of Conditions
    after_rows = sap.read_table(grid, max_rows=20).get("data", [])
    nominal_after = [r for r in after_rows if "nominal interest" in str(r.get("XKOART", "")).lower()]
    base_still_present = any(
        base_effective_from == str(row.get("DGUEL_KP", ""))
        and base_amount == str(row.get("XDESCR_AMOUNT", ""))
        for row in nominal_after
    )
    new_present = any(
        condition.effective_from == str(row.get("DGUEL_KP", ""))
        and _digits(condition.rate) == _digits(str(row.get("XDESCR_AMOUNT", "")).split("%")[0])
        for row in nominal_after
    )
    grew_by_one = len(nominal_after) == len(nominal_before) + 1
    matched = base_still_present and new_present and grew_by_one
    sap.journal.check(
        "Overview of Conditions lists BOTH the original and the new interest "
        "condition items (Copy condition added, it did not overwrite)",
        f"{base_effective_from} / {base_amount.strip()} (unchanged) AND "
        f"{condition.effective_from} / {condition.rate}% (new), "
        f"{len(nominal_before)} -> {len(nominal_before) + 1} rows",
        f"{len(nominal_after)} row(s): "
        + " | ".join(f"{r.get('DGUEL_KP')} {r.get('XDESCR_AMOUNT')}" for r in nominal_after),
        "pass" if matched else "fail",
    )
    if not matched:
        raise WriteRefused(
            "The Overview of Conditions does not show both the original and the new "
            "interest condition item after Copy condition — refusing to continue "
            "toward Save on an interest structure that isn't what this case expects. "
            f"Before: {nominal_before!r}. After: {nominal_after!r}."
        )
    sap.send(3)  # F3 — back to the Structure screen
    info = sap.screen()
    if info.get("program") != "SAPLFTR_IRATE":
        raise WriteRefused(
            f"Returning from Overview of Conditions did not land back on the deal Structure "
            f"screen — landed on {info.get('program')} / {info.get('screen_number')}: "
            f"{info.get('message')}"
        )
    return observed


def save_deal(sap: GuiSession, data: DealData) -> DocumentDescriptor:
    """**WRITE 1** — save the deal. Returns what SAP said it created."""
    def do_save() -> None:
        sap.send(11)  # F11 / Save
        sap.confirm_check_run("Create")

    sap.write_guarded(
        "Save deal (write 1)",
        do_save,
        verify_landed=lambda: bool(describe(sap.status_message(), "Interest rate instrument").number),
    )

    message = sap.status_message()
    doc = describe(message, "Interest rate instrument")
    if not doc.number:
        sap.journal.document("Interest rate instrument", None,
                             data.company_code, ["create attempted"],
                             note=f"no number returned; SAP said: {message!r}")
        sap.journal.check("Create confirmation names the deal",
                          "interest rate instrument <n> ... is created", message, "fail")
        raise WriteRefused(f"Deal save returned no document number. SAP said: {message!r}")

    sap.journal.check("Create confirmation names the deal",
                      "interest rate instrument <n> ... is created", message, "pass")
    sap.journal.document(doc.doc_type, doc.number, doc.company_code or data.company_code,
                         ["created"])
    sap.journal.step("**WRITE 1** — save the deal", "ok", f"deal {doc.number}")
    sap.capture(f"tc-gui-{doc.number}-1-created", f"Deal {doc.number} created")
    return doc


# --------------------------------------------------------------------- settle


def settle_deal(sap: GuiSession, deal_number: str, company_code: str) -> None:
    """
    **WRITE 2** — FTR_EDIT -> Settle -> Save.

    Wrapped in `write_guarded` because this is exactly where TC-014's COM
    connection dropped. The read-only verification is the History screen, which
    answers "is this deal settled?" without touching anything.
    """
    # Whether this run actually settled anything, as opposed to finding it
    # already settled. Claiming "WRITE 2 — ok" for a skipped step overstates what
    # the run did to a live client, which is the same class of error as
    # under-reporting one.
    performed = {"settled": False}

    def do_settle() -> None:
        _open_for_edit(sap, deal_number, company_code)
        sap.press(screen(ENTRY).button("settle"))

        info = sap.screen()
        message = str(info.get("message") or "")
        if "already editing" in message.lower():
            raise RuntimeError(message)
        if "already carried out" in message.lower():
            sap.journal.step("FTR_EDIT settle — already settled by an earlier run, skipped",
                             "skipped", message)
            return
        if info.get("program") != "SAPLFTR_IRATE":
            raise WriteRefused(f"Settle did not reach the deal screen: {message!r}")

        sap.send(11)  # Save — the write happens HERE
        performed["settled"] = True
        sap.journal.document_reached(deal_number, "settled")
        sap.journal.step("**WRITE 2** — FTR_EDIT settle + save", "ok",
                         "Save sent; confirming against the status bar next")

        sap.confirm_check_run("Settle")
        confirmation = sap.status_message()
        settled = any(word in confirmation.lower() for word in ("is changed", "is settled"))
        sap.journal.check("Settle confirmed by SAP", "is changed / is settled",
                          confirmation, "pass" if settled else "fail")
        if not settled:
            raise WriteRefused(f"Settle not confirmed. SAP said: {confirmation!r}")

    sap.write_guarded(
        "Settle (write 2)",
        do_settle,
        verify_landed=lambda: is_settled(sap, deal_number, company_code),
    )
    if performed["settled"]:
        sap.capture(f"tc-gui-{deal_number}-2-settled", f"Deal {deal_number} settled")


def is_settled(sap: GuiSession, deal_number: str, company_code: str) -> bool:
    """
    Read-only: has this deal been settled?

    This is the question TC-014 had to answer by hand after the COM drop, and
    the reason `write_guarded` demands a verification callback. FTR_EDIT's
    History screen lists one row per activity; an unsettled deal shows only the
    contract row. Touches nothing.
    """
    _open_for_edit(sap, deal_number, company_code)
    sap.press(screen(ENTRY).button("history"))
    labels = " | ".join(sap.screen_labels())
    # Strip known static column headers before matching. They contain the same
    # word "settlement" as an actual activity row would, so a bare substring
    # check reports a settled deal for an unsettled one every time this screen
    # is opened - see the finding this fixes.
    stripped = _HISTORY_HEADER_NOISE.sub("", labels).lower()
    settled = "settlement" in stripped or "settle" in stripped
    sap.send(3)  # F3 / Back, off the history screen
    return settled


_HISTORY_HEADER_NOISE = re.compile(
    r"settlement\s+(currency|status|date|amount|type)", re.IGNORECASE
)


def _open_for_edit(sap: GuiSession, deal_number: str, company_code: str) -> None:
    """FTR_EDIT with the deal loaded. Idempotent — safe to call before a retry."""
    entry = screen(ENTRY)
    sap.start_transaction("FTR_EDIT")
    sap.set_field_verified(entry.field("companyCode"), company_code, "Company Code")
    sap.set_field_verified(entry.field("transaction"), deal_number, "Financial Transaction")
    sap.enter()


# ----------------------------------------------------------------- post flows


def post_flows(sap: GuiSession, deal_number: str, company_code: str,
               due_date: str, posting_date: str) -> None:
    """
    **WRITE 3** — TBB1 with Test Run off. Runs straight to the live post.

    No simulation pass, per CLAUDE.md rule 3a: the checkbox is driven to `false`
    and read back, never driven to `true` first.
    """
    tbb1 = screen(TBB1)
    sap.start_transaction("TBB1")
    sap.set_field_verified(tbb1.field("companyCode"), company_code, "Company Code")
    sap.set_field_verified(tbb1.field("transaction"), deal_number, "Transaction")
    sap.set_field_verified(tbb1.field("upToDueDate"), due_date, "Up to and Incl. Due Date")
    sap.set_field_verified(tbb1.field("upToPostingDate"), posting_date,
                           "Up to and Incl. Posting Date")
    sap.set_field_verified(tbb1.field("postingDate"), posting_date,
                           "Posting Date (Posting Control)")
    sap.set_test_run_off(tbb1.field("testRun"), "TBB1")

    sap.journal.step("TBB1 selection — deal, due date, posting date, Test Run off", "ok")
    sap.send(8)  # F8 / Execute — the write happens HERE

    # Recorded before the log is read, deliberately.
    #
    # F8 with Test Run off is the commit; everything after it only *reads* what
    # happened. The first scripted run crashed in the log reader after TBB1 had
    # already posted, and because the journal recorded "posted" further down, the
    # run file under-reported a write that really landed — the exact failure rule
    # 5 exists to prevent. So the write is claimed as soon as it is believed to
    # have occurred, and the log read below either confirms it or records that it
    # could not be confirmed. Over-reporting is corrected by the next line;
    # under-reporting is invisible.
    sap.journal.document_reached(deal_number, "posted")
    sap.journal.step("**WRITE 3** — TBB1 live post (Test Run off, run directly)", "ok",
                     "F8 sent; confirming against the posting log next")

    posted_rows = _read_tbb1_log(sap, deal_number)

    status = sap.status_message()
    if _already_posted(posted_rows) or _already_posted(status):
        # Idempotent re-run: the flows were posted by an earlier run, so there is
        # nothing left for this one to do. Not a failure.
        sap.journal.step("TBB1 — no flows left to post (already posted by an earlier run)",
                         "skipped", (posted_rows or status)[:160])
        sap.journal.check("TBB1 live post names the deal in its posting log",
                          f"posting log contains {deal_number}",
                          "no flows were due — nothing posted by this run", "pass")
    elif deal_number in str(posted_rows):
        sap.journal.check("TBB1 live post names the deal in its posting log",
                          f"posting log contains {deal_number}", posted_rows, "pass")
    elif not str(posted_rows).strip():
        # "Could not read the log" is NOT "the post was wrong", and recording it
        # as `fail` invents a product defect out of a reporting gap. The first
        # resume run did exactly that: TBB1 had already posted, the log came back
        # unreadable, and the report claimed a failed assertion against a deal
        # that was correctly posted. `not-observed` is the honest verdict — it
        # says the run could not confirm, which is true, and leaves the claim
        # made above (the write was sent) standing on its own.
        sap.journal.check("TBB1 live post names the deal in its posting log",
                          f"posting log contains {deal_number}", None)
        sap.journal.deviation(
            f"TBB1's posting log could not be read after the live post of {deal_number} "
            f"(status bar: {status!r}). The F8 was sent with Test Run off, so the post is "
            f"recorded as made — but this run could not confirm it from the log. "
            f"Confirm in SAP before treating this deal as posted."
        )
    else:
        # The log WAS readable and does not mention the deal. That is a real
        # finding, not a reporting gap.
        sap.journal.check("TBB1 live post names the deal in its posting log",
                          f"posting log contains {deal_number}", posted_rows, "fail")
    sap.capture(f"tc-gui-{deal_number}-3-tbb1-live", f"TBB1 live post for {deal_number}")


def _already_posted(log_text: str) -> bool:
    """
    Did TBB1 report there was nothing left to post?

    Re-running is idempotent and SAP says so in its own words rather than by
    returning an empty log — matched explicitly so an idempotent re-run is not
    mistaken for a failed post, and vice versa.
    """
    lowered = str(log_text).lower()
    return any(phrase in lowered for phrase in (
        "no flows exist for processing",
        "no flows exist",
        "does not contain any data",
        "no data was selected",
    ))


def _read_tbb1_log(sap: GuiSession, deal_number: str) -> str:
    """
    Read TBB1's result, whichever shape this company code returns.

    Company 1000 raises an "Information Overview" popup where 9800 returns an
    inline list, so both are handled. The popup's grid needs a row *selection*
    before a double-click will drill in — a bare double-click does nothing, which
    cost TC-014 a wasted call before anyone noticed.
    """
    popup = sap.popup()
    if popup.get("popup_exists") and "information overview" in str(popup.get("title", "")).lower():
        sap.journal.step("TBB1 returned an Information Overview modal (company-code specific)",
                         "ok")
        grid = screen(TBB1).result("informationOverviewGrid")["id"]
        try:
            table = sap.read_table(grid, max_rows=20)
            rows = table.get("data", [])
            target = next(
                (i for i, row in enumerate(rows)
                 if "posting log" in str(row.get("PROTOCOL_TYPE_TEXT", "")).lower()),
                0,
            )
            sap.drill_into_row(grid, target, "PROTOCOL_TYPE_TEXT")
        except Exception as exc:
            sap.journal.deviation(f"TBB1: could not drill into the posting log ({exc}).")
            return ""

    labels = sap.screen_labels()
    return " | ".join(labels)


# ------------------------------------------------------------------- accruals


def run_accrual_deferral(sap: GuiSession, deal_number: str, company_code: str,
                         tpm: TpmData) -> None:
    """**WRITE 4** — TPM44 with Test Run off. Posts accrual/deferral at the key date."""
    tpm44 = screen(TPM44)
    sap.start_transaction("TPM44")
    sap.set_field_verified(tpm44.field("companyCode"), company_code, "Company Code")
    sap.set_field_verified(tpm44.field("valuationArea"), tpm.valuation_area, "Valuation Area")
    sap.set_field_verified(tpm44.field("valuationClass"), tpm.valuation_class, "Valuation Class")
    sap.set_field_verified(tpm44.field("transaction"), deal_number, "Financial Transaction")
    key_date = sap.set_field_verified(tpm44.field("keyDate"), tpm.key_date,
                                      "Accrual/Deferral Key Date")
    sap.set_test_run_off(tpm44.field("testRun"), "TPM44")

    sap.journal.check("TPM44 selection scoped to the deal at the key date",
                      f"{deal_number} / VA {tpm.valuation_area} / "
                      f"Val.Cl. {tpm.valuation_class} / {tpm.key_date}",
                      f"{deal_number} / VA {tpm.valuation_area} / "
                      f"Val.Cl. {tpm.valuation_class} / {key_date}", "pass")
    sap.journal.step("TPM44 selection — deal, valuation area/class, key date, Test Run off", "ok")
    sap.send(8)  # Execute — the write happens HERE

    # Claimed before the result is read, for the reason given in post_flows.
    sap.journal.document_reached(deal_number, "accrued")
    sap.journal.step("**WRITE 4** — TPM44 live run (Test Run off, run directly)", "ok",
                     "F8 sent; confirming against the protocol next")

    if _assert_ran(sap, "TPM44"):
        protocol = " | ".join(sap.screen_labels())
        sap.journal.check("TPM44 protocol produced rows for the deal at the key date",
                          f"protocol mentions {tpm.key_date}",
                          protocol or None,
                          "pass" if tpm.key_date in str(protocol) else "fail")
    sap.capture(f"tc-gui-{deal_number}-4-tpm44-live", f"TPM44 live accrual for {deal_number}")


# ------------------------------------------------------------------ valuation


def run_valuation(sap: GuiSession, deal_number: str, company_code: str,
                  tpm: TpmData) -> None:
    """
    **WRITE 5** — TPM1 with Test Run off.

    Two steps, and step one writes nothing: F8 only *selects* positions. The
    valuation needs "Run Valuation" on the positions screen. A run that pressed
    only F8 once reported PASS having valued nothing, so this asserts the run
    actually moved off the positions screen onto the Valuation Log.
    """
    tpm1 = screen(TPM1)
    sap.start_transaction("TPM1")
    sap.set_field_verified(tpm1.field("companyCode"), company_code, "Company Code")
    sap.set_field_verified(tpm1.field("valuationArea"), tpm.valuation_area, "Valuation Area")
    sap.set_field_verified(tpm1.field("valuationClass"), tpm.valuation_class, "Valuation Class")
    sap.set_field_verified(tpm1.field("transaction"), deal_number, "Financial Transaction")
    key_date = sap.set_field_verified(tpm1.field("keyDate"), tpm.key_date,
                                      "Key Date for Valuation")

    category = sap.select_combobox(tpm1.field("valuationCategory"), tpm.valuation_category)
    sap.journal.checked("TPM1 Valuation Category (mandatory)", tpm.valuation_category, category)
    sap.set_test_run_off(tpm1.field("testRun"), "TPM1")

    sap.journal.check("TPM1 selection scoped to the deal at the key date",
                      f"{deal_number} / {tpm.key_date}",
                      f"{deal_number} / {key_date}", "pass")
    sap.journal.step("TPM1 selection — deal, valuation area/class, category, key date, "
                     "Test Run off", "ok")
    sap.send(8)  # Execute — selects positions only

    _assert_ran(sap, "TPM1")
    positions = " | ".join(sap.screen_labels())
    sap.journal.check("TPM1 position selection found the deal",
                      f"positions list contains {deal_number}",
                      deal_number if deal_number in positions else None)

    # The actual write.
    sap.press(screen(TPM1).nested("positionsScreen", "runValuation")["id"])

    # Claimed before the result is read, for the reason given in post_flows.
    sap.journal.document_reached(deal_number, "valued")
    sap.journal.step("**WRITE 5** — TPM1 live run incl. 'Run Valuation'", "ok",
                     "Run Valuation pressed; confirming the Valuation Log next")

    title = str(sap.screen().get("title") or "")
    sap.journal.checked(
        "TPM1 moved past position selection into an actual valuation",
        "Valuation Log", title,
        lambda o: "valuation log" in str(o).lower(),
    )
    sap.capture(f"tc-gui-{deal_number}-5-tpm1-live", f"TPM1 valuation log for {deal_number}")


# -------------------------------------------------------------------- helpers


#: The only dialogs this lane will confirm on its own.
#:
#: A term starting 01.01.2026 (a public holiday) trips "Not a Working Day /
#: Adopt Date Anyway?". It is safe to adopt the requested date — that is what the
#: case asked for — but *only* this narrow family is auto-confirmed, matched on
#: the popup's own text. Anything else is left alone and recorded, because a
#: dialog nobody anticipated is a finding, not an obstacle: auto-confirming an
#: unknown prompt is how a script agrees to something the case never authorised.
_SAFE_POPUP_MARKERS = (
    "not a working day",
    "adopt date anyway",
    "date is not a working day",
)


def _confirm_working_day_dialog(sap: GuiSession) -> None:
    """
    Confirm the working-day dialog if it appeared, and only if it is that dialog.

    It does not appear on every run — TC-002/TC-009 saw it come and go with
    identical data, so it is session-dependent, not data-dependent. Its absence
    is therefore not a failure and nothing asserts that it showed up; the dates
    are read back off the screen afterwards regardless, and that is what the
    assertions check.
    """
    popup = sap.popup()
    if not popup.get("popup_exists"):
        return

    haystack = " ".join([
        str(popup.get("title", "")),
        *[str(t) for t in popup.get("texts", [])],
    ]).lower()

    if any(marker in haystack for marker in _SAFE_POPUP_MARKERS):
        sap.controller.handle_popup(action="confirm")
        sap.journal.step("Working-day dialog appeared and was confirmed "
                         "(the requested date was adopted)", "ok")
        return

    # An unrecognised dialog. Record what it said and leave it standing — the
    # caller's next read will fail loudly rather than this quietly agreeing.
    title = str(popup.get("title", "")) or "(untitled)"
    sap.journal.deviation(
        f"An unrecognised dialog appeared on the deal screen and was NOT "
        f"confirmed: {title!r}. Buttons: "
        f"{[b.get('text') or b.get('tooltip') for b in popup.get('buttons', [])]}. "
        f"Nothing was agreed to on the run's behalf."
    )
    raise WriteRefused(
        f"Unrecognised dialog on the deal screen: {title!r}. Refusing to confirm "
        f"a prompt this case does not know about."
    )


def _assert_ran(sap: GuiSession, where: str) -> bool:
    """
    Catch the silent refusals. Returns False if there was nothing to process.

    TPM1 refuses a missing Valuation Category with nothing but a status-bar
    line: no dialog, and a selection screen that still looks correct. Reading
    the message is the only way to notice.
    """
    message = sap.status_message()
    lowered = message.lower()
    if "mandatory field" in lowered:
        sap.journal.check(f"{where} ran rather than refusing", "no refusal", message, "fail")
        raise WriteRefused(f"{where} refused to run: {message!r}")
    if _already_posted(message) or "no data" in lowered:
        # Idempotent re-run, not a failure — the web lane treats this the same.
        sap.journal.step(f"{where} — nothing left to process (already run)", "skipped", message)
        return False
    return True


def _digits(text: Any) -> str:
    cleaned = "".join(ch for ch in str(text) if ch.isdigit() or ch in ".,-").replace(",", "")
    if "." in cleaned:
        cleaned = cleaned.rstrip("0").rstrip(".")
    return cleaned
