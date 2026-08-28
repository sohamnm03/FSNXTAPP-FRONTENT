"""
TC-018 — FWZZ create a Class for product type 26B (Inv: Mutual Funds), in the
GUI lane.

The executable copy of
`test-cases/GUI-TC/TC-018-FWZZ-26B-mutual-fund-class-creation-gui.md`.

GUI-lane sibling of TC-017 (web lane, WebGUI/ITS). Same business question -
does FWZZ accept and persist a new Class for product type 26B - same data,
different rendering path. The two are not interchangeable as evidence:
CLAUDE.md's whole reason for two lanes is that a transaction reachable both
ways does not fail the same way, and this case exists to actually check that
rather than assume it.

Every id this case relies on came from live discovery via
`sap_get_screen_elements`/`sap_get_toolbar_buttons` on DS4/100, 2026-08-19 -
not carried over from the web lane's DOM ids, which do not exist in this
rendering path. See `gui_tests/screens/fwzz-*.json` for the ids themselves and
the discovery notes:

  - Product type 26B is internally numbered. The entry screen's ID Number
    field is never typed into; Check/Create refuses a typed one with
    "Numbers assigned to product type 26B internally" - the same finding
    the web lane made independently.
  - The class master opens on "Search Terms"; the fields 26B actually
    requires (Issuer, Issue Currency) live on "Basic Data", one tab over.
  - Issuer must be a Business Partner in role TR0150. `700000453` ("TATA
    FIN PVT.LTD / MUMBAI") is confirmed valid by a live Check (F8): "Data is
    consistent" (message class 65, number 202) - found the same way the web
    lane found it, by trying a plain deal counterparty (400000003) first and
    having it refused, then typing a business partner already known to this
    workspace and validating it with Check rather than Save.
  - Check (F8) on this rendering path prints its clean result straight to the
    status bar, no popup - unlike the web lane's ITS rendering, which shows
    the identical text inside a popup dialog. An unclean Check was not
    independently confirmed here; `securities.check_class` reads a popup too,
    if one appears, so that path fails loudly instead of being misread.
"""
from __future__ import annotations

from ..modules.securities import (
    ClassData,
    check_class,
    fill_basic_data,
    fill_create_dialog,
    open_class_entry,
    open_create_dialog,
    press_create_confirm,
    save_class,
    verify_persisted,
)
from ..session import GuiSession

CASE_ID = "TC-018"

#: Mirrors TC-017's (web lane) `test-data/fwzz-mutual-fund-class.dataset.json`
#: baseline row exactly - same product type, same mock names, same Issuer and
#: currency - so the two lanes are comparing the same business input through
#: different rendering paths, not two different questions.
BASELINE = ClassData(
    product_type="26B",
    short_name="NIFTY50 IDX FUN",
    long_name="NIIF Nifty 50 Index Fund - Growth",
    issuer="700000453",
    issue_currency="INR",
)

#: In order. A run stops after the stage it was asked for. `entry`, `dialog`
#: and `basic` write **nothing**, which makes them the harness smoke test for
#: this case.
STAGES = ("entry", "dialog", "basic", "save")
DEFAULT_STAGE = "save"

#: What each stage writes, named before it runs — CLAUDE.md rule 3. The
#: runner prints these and waits for a yes.
WRITES = {
    "save": "FWZZ Save — creates one new Class (product type 26B, Issuer "
            "700000453, currency INR). Id is server-assigned.",
}


def writes_for(stage: str) -> list[str]:
    """Every database write a run up to *stage* will make."""
    limit = STAGES.index(stage)
    return [text for name, text in WRITES.items() if STAGES.index(name) <= limit]


def run(sap: GuiSession, stage: str = DEFAULT_STAGE,
        deal_number: str | None = None, data: ClassData = BASELINE) -> str | None:
    """
    Drive the case. Returns the new class id, if Save was reached.

    `deal_number` is accepted for signature compatibility with the runner's
    `--resume`, but this case creates and then stops - there is no later
    stage to resume into, the same reasoning TC-015 documents. Passing one is
    refused rather than silently ignored.
    """
    if stage not in STAGES:
        raise ValueError(f"Unknown stage {stage!r}. Known: {', '.join(STAGES)}")
    reached = STAGES.index(stage)
    journal = sap.journal

    if deal_number:
        raise SystemExit(
            f"TC-018 is create-only, so there is nothing to resume against "
            f"{deal_number}. Re-running without --resume creates a second class, "
            f"which may be what you want; confirm the first one's state with "
            f"scripts/check-run.ps1 -Latest before deciding."
        )

    journal.meta("Stage", stage)
    journal.meta("Data", f"product type {data.product_type}, issuer {data.issuer}, "
                         f"currency {data.issue_currency}")

    open_class_entry(sap)
    if reached < STAGES.index("dialog"):
        journal.step("Stopped after the entry screen, as asked — nothing written", "skipped")
        return None

    open_create_dialog(sap)
    fill_create_dialog(sap, data)
    if reached < STAGES.index("basic"):
        journal.step("Stopped before Create (F5), as asked — nothing written", "skipped")
        return None

    press_create_confirm(sap)
    issuer_text = fill_basic_data(sap, data)
    journal.meta("Issuer resolved to", issuer_text)
    check_class(sap)
    if reached < STAGES.index("save"):
        journal.step("Stopped before Save, as asked — nothing written", "skipped")
        return None

    doc = save_class(sap, data)
    verify_persisted(sap, doc.number, data)
    return doc.number
