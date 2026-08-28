"""
Reusable business components for the GUI lane — Class (FWZZ) maintenance and
an FTR_CREATE deal against one, for product type 26B (Inv: Mutual Funds).

The web lane's `web-tests/tests/fwzz-mutual-fund-class-create.spec.ts` (TC-017)
and `web-tests/tests/fwzz-then-ftr-26b-mutual-fund.spec.ts` (TC-019) drive the
same screens through the ITS WebGUI, addressing fields by DOM `title`. SAP GUI
Scripting is a different rendering path with its own element ids
(`wnd[0]/usr/subHEADER:SAPLFVW4:0110/ctxt...`), discovered fresh here via
`sap_get_screen_elements` rather than assumed from the web lane's ids -
CLAUDE.md rule 4, and the reason a transaction reachable both ways gets its own
screen models per lane rather than one shared file. The FTR_CREATE deal screen
turned out to be the *same program* on both lanes (`SAPLTTM_UI_FRAMEWORK`) with
the *same* Enter/Save/Enter commit quirk (see `save_mutual_fund_deal`) -
confirming that quirk is a backend behavior, not a rendering-path artifact.

Every function records what it did to the journal as it goes, so the run
file is emitted rather than transcribed - same discipline as
`gui_tests/modules/treasury.py`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..screens import screen
from ..session import GuiSession, WriteRefused

ENTRY = "fwzz-entry"
DIALOG = "fwzz-create-dialog"
MASTER = "fwzz-class-master"
FTR_ENTRY = "ftr-entry"
DEAL = "ftr-26b-deal"


@dataclass
class ClassData:
    """One security class's input values."""
    product_type: str
    short_name: str
    long_name: str
    issuer: str
    issue_currency: str
    #: Basic Data tab, "Issue Start". Optional - not every case sets it.
    issue_start_date: str | None = None
    #: Basic Data tab, "Nominal Value". Optional.
    nominal_value: str | None = None


@dataclass
class ClassDescriptor:
    """What SAP actually assigned. `number` is None until after Save."""
    product_type: str
    short_name: str
    number: str | None
    raw_id_field: str = ""


# ------------------------------------------------------------------ entry


def open_class_entry(sap: GuiSession) -> None:
    """
    FWZZ's entry screen. Leaves the ID Number field untouched.

    Never types an id here: product type 26B assigns numbers internally, and
    Check/Create refuses a typed one with "Numbers assigned to product type
    26B internally (do not enter an ID number)" - found live on both lanes.
    A case for a product type that is NOT internally numbered would set this
    field; this module does not support that path since nothing here needs it
    yet.
    """
    sap.start_transaction("FWZZ")
    sap.journal.step("opened FWZZ entry screen", "ok")


def open_create_dialog(sap: GuiSession) -> None:
    """Press Create on the entry screen. Opens the modal dialog, commits nothing."""
    entry = screen(ENTRY)
    sap.press(entry.button("create"))
    info = sap.screen()
    if info.get("screen_number") != 115:
        raise WriteRefused(
            f"Create did not open the Create Class dialog - landed on "
            f"{info.get('program')} / {info.get('screen_number')}: {info.get('message')}"
        )
    sap.journal.step("opened Create Class dialog", "ok")


# -------------------------------------------------------------------- fill


def fill_create_dialog(sap: GuiSession, data: ClassData) -> None:
    """
    Fill the Create Class dialog and read every value back.

    Status/Reference radios are driven explicitly (Active, Without Reference)
    rather than trusted at their default: `GuiRadioButton`'s `read_field`
    returns the label text, not a selection state, so there is no cheap way to
    prove which radio in the group is actually selected without driving it.
    """
    dialog = screen(DIALOG)
    for radio_key in ("statusActive", "withoutReference"):
        radio_id = dialog.nested("radios", radio_key)["id"]
        result = sap.controller.select_radio_button(radio_id)
        if result.get("error"):
            raise WriteRefused(f"Could not select radio {radio_key!r} ({radio_id}): {result['error']}")

    product_type = sap.set_field_verified(dialog.field("productType"), data.product_type,
                                          "Product Type")
    sap.journal.check("Product Type as typed", data.product_type, product_type,
                      "pass" if product_type == data.product_type else "fail")

    sap.set_field(dialog.field("shortName"), data.short_name)
    sap.set_field(dialog.field("longName"), data.long_name)
    sap.journal.step("filled Create Class dialog", "ok",
                     f"product type {data.product_type}, short name {data.short_name!r}")


def press_create_confirm(sap: GuiSession) -> None:
    """
    Create (F5) on the dialog. Opens the class master - does not commit.

    Defensive: this case never types an ID Number, so the internal-numbering
    info popup should not appear here, but a screen the case did not expect is
    handled rather than assumed away.
    """
    dialog = screen(DIALOG)
    sap.press(dialog.button("createConfirm"))
    popup = sap.popup()
    if popup.get("popup_exists"):
        text = " ".join(str(t) for t in popup.get("texts", []) if str(t).strip())
        sap.journal.deviation(f"unexpected popup right after Create (F5): {text[:300]}")
        buttons = {str(b.get("text", "")).lower(): b["id"] for b in popup.get("buttons", [])}
        cont = buttons.get("continue") or dialog.button("continue")
        sap.press(cont)

    master = screen(MASTER)
    id_placeholder = sap.read_field(master.field("idNumber"))
    sap.journal.check("ID Number before Save", "\\INTERN\\ (placeholder)", id_placeholder)
    if id_placeholder != "\\INTERN\\":
        sap.journal.deviation(
            f"ID Number before Save read {id_placeholder!r}, not the expected internal "
            f"placeholder '\\INTERN\\' - product type may not be internally numbered "
            f"the way 26B is, or the screen did not open as expected."
        )
    sap.journal.step("class master opened (Search Terms tab)", "ok")


def fill_basic_data(sap: GuiSession, data: ClassData) -> str:
    """
    Switch to Basic Data, fill Issuer + Issue Currency, and resolve the
    Issuer's name.

    Returns the resolved Issuer text (e.g. "TATA FIN PVT.LTD / MUMBAI
    400021"), which is blank until Enter is pressed - a round trip, not an
    immediate echo.
    """
    master = screen(MASTER)
    sap.select_tab(master.tab("basicData"))

    issuer = sap.set_field_verified(master.field("issuer"), data.issuer, "Issuer")
    currency = sap.set_field_verified(master.field("issueCurrency"), data.issue_currency,
                                      "Issue Currency")
    sap.enter()  # resolves the Issuer's name text

    issuer_text = sap.read_field(master.field("issuerText"))
    sap.journal.check("Issuer as typed", data.issuer, issuer,
                      "pass" if issuer == data.issuer else "fail")
    sap.journal.check("Issue Currency as typed", data.issue_currency, currency,
                      "pass" if currency.strip().upper() == data.issue_currency else "fail")
    sap.journal.check("Issuer resolves to a name", "(a business partner name)", issuer_text,
                      "pass" if issuer_text.strip() else "fail")
    if not issuer_text.strip():
        raise WriteRefused(
            f"Issuer {data.issuer!r} did not resolve to a name after Enter - it is "
            f"probably not a Business Partner in role TR0150. Confirm with Check (F8) "
            f"before ever pressing Save with an unresolved Issuer."
        )

    if data.issue_start_date:
        issue_start = sap.set_field_verified(master.field("issueStartDate"), data.issue_start_date,
                                             "Issue Start Date")
        sap.journal.check("Issue Start Date as typed", data.issue_start_date, issue_start,
                          "pass" if issue_start == data.issue_start_date else "fail")
    if data.nominal_value:
        sap.set_field(master.field("nominalValue"), data.nominal_value)
        nominal_back = sap.read_field(master.field("nominalValue"))
        nominal_ok = nominal_back.replace(",", "").replace(" ", "").lstrip("0") \
            == data.nominal_value.replace(",", "").lstrip("0")
        sap.journal.check("Nominal Value as typed", data.nominal_value, nominal_back,
                          "pass" if nominal_ok else "fail")

    return issuer_text


def check_class(sap: GuiSession) -> str:
    """
    Check (F8) - validates only, never a save.

    A clean check (confirmed live, Issuer 700000453 / INR) prints "Data is
    consistent" (message class 65, number 202) directly to the status bar -
    no popup. An *unclean* check was not independently confirmed via the GUI
    lane the way the web lane's ITS rendering was (a "Class: Display messages"
    grid popup listing each missing field) - this reads a popup too, if one
    appears, so an error path this case has not seen fails loudly rather than
    being misread as a pass.
    """
    master = screen(MASTER)
    sap.press(master.button("check"))

    popup = sap.popup()
    if popup.get("popup_exists"):
        text = " ".join(str(t) for t in popup.get("texts", []) if str(t).strip())
        sap.journal.check("Check (F8) result", "Data is consistent", text, "fail")
        sap.controller.handle_popup(action="cancel")
        raise WriteRefused(f"Check (F8) opened a popup instead of a clean status message: {text}")

    message = sap.status_message()
    info = sap.screen()
    is_error = str(info.get("message_type", "")).upper() == "E"
    consistent = (not is_error) and bool(message)

    sap.journal.check("Check (F8) result", "Data is consistent", message,
                      "pass" if consistent else "fail")
    if not consistent:
        raise WriteRefused(f"Check (F8) reported a problem: {message!r}")
    return message


# --------------------------------------------------------------------- save


def save_class(sap: GuiSession, data: ClassData) -> ClassDescriptor:
    """**THE WRITE** — Save. Returns the server-assigned class id."""
    master = screen(MASTER)
    sap.press(master.button("save"))

    popup = sap.popup()
    if popup.get("popup_exists"):
        text = " ".join(str(t) for t in popup.get("texts", []) if str(t).strip())
        sap.journal.step("popup after Save", "ok", text[:400])
        buttons = {str(b.get("text", "")).lower(): b["id"] for b in popup.get("buttons", [])}
        cont = buttons.get("continue") or buttons.get("yes") or buttons.get("ok")
        if cont:
            sap.press(cont)

    new_id = sap.read_field(master.field("idNumber"))
    sap.journal.check("ID Number after Save", "a real assigned id (not the placeholder)",
                      new_id, "pass" if new_id and new_id != "\\INTERN\\" else "fail")
    if not new_id or new_id == "\\INTERN\\":
        raise WriteRefused(f"Save did not assign a real class id - field reads {new_id!r}")

    sap.journal.document("Security Class (FWZZ)", new_id, lifecycle=["created"],
                         note=f"product type {data.product_type}, issuer {data.issuer}, "
                              f"currency {data.issue_currency}")
    sap.journal.step("**WRITE 1** — save the class", "ok", f"class {new_id}")
    sap.capture(f"tc-gui-fwzz-{new_id}-created", f"Class {new_id} created")
    return ClassDescriptor(data.product_type, data.short_name, new_id, new_id)


def verify_persisted(sap: GuiSession, class_id: str, data: ClassData) -> None:
    """
    Re-Display the class fresh and re-read Short Name + Issuer.

    Same rigor TC-017 (web lane) applies after its own post-write verification
    bug: read Short Name on Search Terms (its own tab) before switching to
    Basic Data for Issuer, rather than losing Short Name by being on the
    wrong tab when it is read.
    """
    entry = screen(ENTRY)
    master = screen(MASTER)
    sap.start_transaction("FWZZ")
    sap.set_field_verified(entry.field("idNumber"), class_id, "ID Number")
    sap.press(entry.button("display"))

    verify_short = sap.read_field(master.field("shortName"))
    sap.journal.check("Short Name persisted (re-Display)", data.short_name, verify_short,
                      "pass" if verify_short == data.short_name else "fail")

    sap.select_tab(master.tab("basicData"))
    verify_issuer = sap.read_field(master.field("issuer"))
    sap.journal.check("Issuer persisted (re-Display)", data.issuer, verify_issuer,
                      "pass" if data.issuer in verify_issuer else "fail")

    if verify_short != data.short_name or data.issuer not in verify_issuer:
        raise WriteRefused(
            f"Post-write verification failed: Short Name read {verify_short!r} "
            f"(expected {data.short_name!r}), Issuer read {verify_issuer!r} "
            f"(expected to contain {data.issuer!r})."
        )


# ---------------------------------------------------------------- FTR_CREATE


@dataclass
class MutualFundDealSpec:
    """One FTR_CREATE deal's input values, for product type 26B."""
    company_code: str
    transaction_type: str
    partner: str
    securities_account: str
    general_valuation_class_key: str
    number_of_units: str
    price: str


def open_mutual_fund_deal_entry(sap: GuiSession, class_id: str, spec: MutualFundDealSpec) -> None:
    """
    FTR_CREATE's entry screen for a securities-type product (26B): company
    code, product type 26B, transaction type, the Security Class id (the id
    a prior `save_class` returned) and a business partner.
    """
    entry = screen(FTR_ENTRY)
    sap.start_transaction("FTR_CREATE")
    sap.set_field_verified(entry.field("companyCode"), spec.company_code, "Company Code")
    sap.set_field_verified(entry.field("productType"), "26B", "Product Type")
    sap.set_field_verified(entry.field("transactionType"), spec.transaction_type, "Transaction Type")
    sap.set_field_verified(entry.field("classId"), class_id, "Security Class")
    sap.set_field_verified(entry.field("partner"), spec.partner, "Partner")
    sap.journal.step(
        f"FTR_CREATE entry — co.code {spec.company_code}, product 26B, txn type "
        f"{spec.transaction_type}, class {class_id}, partner {spec.partner}", "ok",
    )
    sap.enter()

    info = sap.screen()
    if info.get("program") != "SAPLTTM_UI_FRAMEWORK":
        raise WriteRefused(
            f"FTR_CREATE did not reach the 26B deal screen - landed on "
            f"{info.get('program')} / {info.get('screen_number')}: {info.get('message')}"
        )


@dataclass
class FilledMutualFundDeal:
    number_of_units: str
    price: str
    securities_account: str
    general_valuation_class: str
    calculation_date: str
    payment_date: str
    payment_currency: str


def fill_mutual_fund_deal(sap: GuiSession, spec: MutualFundDealSpec) -> FilledMutualFundDeal:
    """
    Fill the deal screen's Structure tab and read every value back.

    `calculationDate`/`paymentDate` are never hardcoded: SAP defaults
    `Position Value Date` to today on every run, and this reads that value
    back and reuses it for both other date fields (which are NOT
    auto-defaulted), so the case never goes stale on the day it happens to
    run - same approach the web lane's `fillMutualFundDeal` uses.
    """
    deal = screen(DEAL)

    position_value_date = sap.read_field(deal.field("positionValueDate"))
    if not position_value_date:
        raise WriteRefused(
            "Position Value Date was not defaulted by SAP - cannot derive the other dates"
        )
    sap.journal.step(
        f"Position Value Date (SAP default, reused for calc/payment date): {position_value_date}", "ok",
    )

    gvc_label = sap.select_combobox(deal.field("generalValuationClass"), spec.general_valuation_class_key)

    securities_account = sap.set_field_verified(
        deal.field("securitiesAccount"), spec.securities_account, "Securities Account",
    )
    sap.set_field(deal.field("numberOfUnits"), spec.number_of_units)
    sap.set_field(deal.field("price"), spec.price)
    sap.set_field(deal.field("calculationDate"), position_value_date)
    sap.set_field(deal.field("paymentDate"), position_value_date)
    sap.enter()

    units = sap.read_field(deal.field("numberOfUnits"))
    price = sap.read_field(deal.field("price"))
    calc_date = sap.read_field(deal.field("calculationDate"))
    pay_date = sap.read_field(deal.field("paymentDate"))
    pay_ccy = sap.read_field(deal.field("paymentCurrency"))

    sap.journal.check("Number of Units as typed", spec.number_of_units, units)
    sap.journal.check("Price as typed", spec.price, price)
    sap.journal.check("Securities Account as typed", spec.securities_account, securities_account,
                      "pass" if securities_account == spec.securities_account else "fail")
    sap.journal.check("General Valuation Class selected", spec.general_valuation_class_key, gvc_label)

    return FilledMutualFundDeal(
        number_of_units=units, price=price, securities_account=securities_account,
        general_valuation_class=gvc_label, calculation_date=calc_date, payment_date=pay_date,
        payment_currency=pay_ccy,
    )


def check_mutual_fund_deal(sap: GuiSession) -> None:
    """
    Check (F6) — validates, never a save.

    Tolerates exactly one known, non-blocking warning: "No payment details
    entered for transaction" (message class FTR0, number 030, type W -
    confirmed live on this lane, 2026-08-20, identical to the web lane's
    finding). Any other message fails the case rather than being silently
    accepted.
    """
    deal = screen(DEAL)
    result = sap.press(deal.button("checkButton"))
    info = result.get("screen", {})
    msg = str(info.get("message") or "")
    msg_type = str(info.get("message_type") or "").upper()
    is_known_warning = "no payment details entered for transaction" in msg.lower()
    clean = (not msg) or is_known_warning or msg_type == "S"

    sap.journal.check("Check (F6) result", "clean, or only the known payment-details warning", msg,
                      "pass" if clean else "fail")
    if is_known_warning:
        sap.journal.deviation(f"Check (F6): known non-blocking warning - {msg!r}")
    if not clean:
        raise WriteRefused(f"Check (F6) reported an unexpected problem: {msg}")


_DEAL_NUMBER_PATTERNS = (
    re.compile(r"financial transaction\s+(\d{4,12})\s+saved", re.IGNORECASE),
    re.compile(r"saved under number\s+(\d{4,12})", re.IGNORECASE),
)


def _extract_deal_number(msg: str) -> str:
    # Both patterns require the word "saved" in context. A bare \d{5,12}
    # fallback used to match any incidental number in the status bar (an
    # echoed partner id, a message number) and was found true before Save
    # had even been pressed - CLAUDE.md rule 6, never invent a result.
    for pattern in _DEAL_NUMBER_PATTERNS:
        m = pattern.search(msg)
        if m:
            return m.group(1)
    return ""


def save_mutual_fund_deal(sap: GuiSession) -> str:
    """
    **WRITE** — Save the deal. Returns SAP's own confirmation deal number.

    The known "No payment details entered for transaction" warning has to be
    acknowledged before Save actually commits, and a bare Save press does not
    do it — confirmed live, 2026-08-20: pressing Save straight after Check
    reproduced the identical warning, message class FTR0 030, with the
    Transaction field still on the internal placeholder. **The sequence that
    actually commits is Enter, Save, Enter** — the confirmation ("Financial
    transaction saved under number 23000143", message T1 033) appeared only
    after the *second* Enter, and the screen navigated back to FTR_ENTRY at
    that point. Identical finding to the web lane's `saveMutualFundDeal`,
    which is what confirms this is a backend/business-logic quirk rather
    than something specific to either rendering path.

    Checks the status message for a deal number after every step, so it
    stops the moment SAP reports one rather than assuming which specific
    step is "the" commit.
    """
    deal = screen(DEAL)

    def check_for_number(where: str) -> str:
        msg = sap.status_message()
        n = _extract_deal_number(msg)
        sap.journal.step(f"{where}: {msg!r}" + (f" -> deal {n}" if n else ""), "ok")
        return n

    sap.enter()
    deal_number = check_for_number("after Enter (1)")

    if not deal_number:
        def do_save() -> None:
            sap.press(deal.button("saveButton"))

        sap.write_guarded(
            "Save mutual fund deal (write)",
            do_save,
            verify_landed=lambda: bool(check_for_number("after COM reconnect")),
        )
        deal_number = check_for_number("after Save")

    if not deal_number:
        sap.enter()
        deal_number = check_for_number("after Enter (2)")

    final_msg = sap.status_message()
    sap.journal.check("Save confirmation names the deal", "Financial transaction <number> saved",
                      final_msg, "pass" if deal_number else "fail")
    if not deal_number:
        raise WriteRefused(
            f"Save (Enter, Save, Enter) did not report a deal number. SAP said: {final_msg!r}"
        )

    sap.journal.document(
        "Investment Fund transaction (FTR_CREATE, 26B)", deal_number,
        lifecycle=["created"],
    )
    sap.capture(f"tc-gui-{deal_number}-2-created", f"Deal {deal_number} created")
    return deal_number
