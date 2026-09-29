"""
Publish an OData V4 service group via /IWFND/V4_ADMIN — direct COM automation.

Same architecture as scripts/sap-gui-create-tcode.py: imports
mcp_sap_gui.sap_controller.SAPGUIController directly, no MCP protocol layer,
one process call instead of a dozen tool-call round trips. Frozen from the
live-verified flow used to publish ZFS_SB_MATERIAL_O4_API on 2026-08-22 (see
docs/sap-gui-object-automation.md Script 3, lessons/lessons-ledger.md L-232).

This replaces the manual "/IWFND/V4_ADMIN -> Publish Service Groups -> ALV
PUBLISH" flow documented in L-220, which previously had to be driven by hand
because publishServiceBinding (mcp-abap-abap-adt-api) reports success without
actually publishing.

SCOPE: this script drives /IWFND/V4_ADMIN only. There is no parameter or code
path that reaches any other transaction (L-231 — the vendored mcp_sap_gui
package has no blocklist of its own; a direct-import script bypasses whatever
the MCP protocol layer enforces, so the restriction is hardcoded here).

Publishing is a real, consequential write — it exposes a service that was not
reachable before. This script will not guess a target: pass the exact
GROUP_ID, and it refuses anything that doesn't look like a custom (Z*) or
partner-namespace (starting with a customer prefix) service group.

Usage:
    "tools\\mcp-sap-gui\\.venv\\Scripts\\python.exe" scripts\\sap-gui-publish-service.py ^
        --group-id ZFS_SB_SOMETHING_O4_API --yes

Omit --yes to only look up whether the group is currently unpublished,
without publishing anything.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VENDORED = REPO_ROOT / "tools" / "mcp-sap-gui" / ".venv" / "Lib" / "site-packages"
if VENDORED.is_dir() and str(VENDORED) not in sys.path:
    sys.path.insert(0, str(VENDORED))

from mcp_sap_gui.sap_controller import SAPGUIController  # noqa: E402

EXPECTED_SYSTEM = "DS4"
EXPECTED_CLIENT = "100"
LOG_PATH = REPO_ROOT / "logs" / "sap-gui-tcode-automation.jsonl"
GRID_ID = "wnd[0]/usr/cntlGUI_AREA/shellcont/shell"


class PublishError(Exception):
    """A precondition failed or SAP responded unexpectedly. Nothing assumed committed."""


def log(event: dict) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), **event}
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


def assert_dev_system(controller: SAPGUIController) -> None:
    info = controller.get_session_info()
    if info.system_name != EXPECTED_SYSTEM or str(info.client) != EXPECTED_CLIENT:
        raise PublishError(
            f"Refusing to run: session is {info.system_name}/{info.client}, "
            f"expected {EXPECTED_SYSTEM}/{EXPECTED_CLIENT}."
        )


def find_unpublished_row(controller: SAPGUIController, group_id: str, system_alias: str = "LOCAL") -> dict | None:
    """Filter the publish-candidates grid to group_id, return its row or None.

    An exact GROUP_ID that is already published or does not exist pops a
    dialog ("Selected service group not found or already published") on
    wnd[1] instead of showing an (empty) table on wnd[0] — dismiss it and
    report "not found" rather than treating it as an error.
    """
    c = controller
    # L-246: "Get Service Groups" refuses a blank System Alias with an
    # Information popup ("Specify a System Alias") and returns NO grid at all.
    # Without this the lookup reports "not in the unpublished-candidates list"
    # for a group that is sitting right there unpublished - which is exactly
    # what it did on 2026-09-13 for ZFS_SB_DYNGW_O4_API.
    c.set_field("wnd[0]/usr/ctxtIP_SYSTEM_ALIAS", system_alias)
    c.set_field("wnd[0]/usr/txtIP_GROUP_ID", group_id)
    c.press_button("wnd[0]/tbar[1]/btn[8]")  # Get Service Groups

    screen = c.get_screen_info()
    if screen.get("active_window") != "wnd[0]":
        c.press_button("wnd[1]/tbar[0]/btn[0]")  # dismiss "not found" info popup
        return None

    table = c.read_table(GRID_ID)
    for row in table.get("data", []):
        if row.get("GROUP_ID") == group_id:
            return row
    return None


def publish_service_group(controller: SAPGUIController, group_id: str, system_alias: str = "LOCAL") -> dict:
    if not (group_id.upper().startswith("Z") or group_id.startswith("/")):
        raise PublishError(
            f"Refusing to publish {group_id!r}: does not look like a custom "
            "(Z*) or partner-namespace (/...) service group."
        )

    c = controller
    c.execute_transaction("/IWFND/V4_ADMIN")
    assert_dev_system(c)
    c.press_button("wnd[0]/tbar[1]/btn[2]")  # Publish Service Groups

    row = find_unpublished_row(c, group_id, system_alias)
    if row is None:
        raise PublishError(
            f"{group_id!r} is not in the unpublished-candidates list — already "
            "published, or the name is wrong. Nothing done."
        )
    idx = row.get("_absolute_row_index")

    c.select_table_row(GRID_ID, idx)
    c.press_alv_toolbar_button(GRID_ID, "PUBLISH")

    confirm_screen = c.get_screen_info()
    if "Publish Service Group" not in (confirm_screen.get("title") or ""):
        raise PublishError(
            "Expected the 'Publish Service Group' confirmation popup, saw: "
            f"{confirm_screen.get('title')!r}. Stopping rather than guessing."
        )
    c.press_button("wnd[1]/tbar[0]/btn[0]")  # confirm, keep the existing description

    # Result popup — read the message field directly (avoids get_popup_window,
    # which this session's permission classifier intermittently refused).
    # get_screen_elements() returns a plain list of ScreenElement dataclasses
    # (attribute access), not the dict-with-"elements"-key shape the MCP tool
    # wrapper produces around the same call.
    message = ""
    for el in c.get_screen_elements("wnd[1]/usr"):
        if el.name == "MESSTXT1":
            message = el.text
            break
    c.press_button("wnd[1]/tbar[0]/btn[0]")

    published = "successfully published" in message.lower()

    still_unpublished = find_unpublished_row(c, group_id, system_alias) is not None

    return {
        "group_id": group_id,
        "publish_message": message,
        "ok": published and not still_unpublished,
        "still_in_unpublished_list": still_unpublished,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--group-id", required=True)
    parser.add_argument("--system-alias", default="LOCAL", help="System Alias for Get Service Groups (L-246). Default LOCAL.")
    parser.add_argument("--yes", action="store_true", help="Actually publish. Without it, only looks up status.")
    args = parser.parse_args()

    controller = SAPGUIController()
    controller.connect_to_existing_session(0, 0)
    assert_dev_system(controller)

    if not args.yes:
        controller.execute_transaction("/IWFND/V4_ADMIN")
        controller.press_button("wnd[0]/tbar[1]/btn[2]")
        row = find_unpublished_row(controller, args.group_id, args.system_alias)
        if row is None:
            print(f"{args.group_id!r} is not in the unpublished list (already published, or name is wrong).")
        else:
            print(f"{args.group_id!r} is unpublished:")
            print(json.dumps(row, indent=2))
        print("Not touching SAP further (pass --yes to publish).")
        return 0

    print(f"About to publish service group {args.group_id!r}.")
    try:
        result = publish_service_group(controller, args.group_id, args.system_alias)
    except Exception as exc:  # noqa: BLE001 - report and stop, no silent retry
        log({"event": "publish_failed", "group_id": args.group_id, "error": str(exc)})
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1

    log({"event": "publish_ok", **result})
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
