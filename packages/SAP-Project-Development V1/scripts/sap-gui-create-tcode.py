"""
Create a report transaction code via SE93 — direct COM automation.

Frozen from the verified interactive sequence in
docs/sap-gui-object-automation.md (Script 1). Imports
mcp_sap_gui.sap_controller.SAPGUIController directly from this project's own
vendored install (tools/mcp-sap-gui/.venv) instead of going through the MCP
protocol layer, so there is no per-field model round trip — one process
invocation drives the whole SE93 wizard. Same pattern as
D:\\SAP Tool\\SAP-Testing-Automation\\gui_tests\\session.py, which does the
same thing for its own transactions.

SCOPE — read before touching this file:
  This script drives SE93 and nothing else. There is no parameter, flag, or
  code path that makes it call execute_transaction() with any tcode other
  than "SE93" — that restriction is hardcoded, not configurable. The reason:
  going around the MCP protocol layer also goes around whatever tool-call
  blocklist that layer enforces (confirmed empirically — the vendored
  mcp_sap_gui package itself has no blocklist logic at all; see
  lessons/lessons-ledger.md L-231). A generic "run any tcode" version of this
  script would have none of the SU01/PFCG/SE16N/SE38 protection the MCP tool
  path has. Do not widen this script into a general transaction runner.

Usage:
    "tools\\mcp-sap-gui\\.venv\\Scripts\\python.exe" scripts\\sap-gui-create-tcode.py ^
        --tcode ZFS_XA_USRREC4 --program ZFS_R_XA_USRREC ^
        --package ZFS_K2_CC_VS --transport DS4K907018 ^
        --short-text "User provisioning live record" --yes

Omit --yes to validate arguments (naming pattern, short-text length) without
touching SAP at all.
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


class TcodeCreationError(Exception):
    """A precondition failed or SAP responded unexpectedly. Nothing assumed committed."""


def log(event: dict) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), **event}
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


def assert_dev_system(controller: SAPGUIController) -> None:
    """Rule 1, enforced not assumed — refuse anything but the dev system/client.

    The Logon Pad on this machine also holds two production entries (L-213);
    this script has no protocol-layer confirmation step to catch that, so it
    checks directly, before the first write and again once inside SE93.
    """
    info = controller.get_session_info()
    if info.system_name != EXPECTED_SYSTEM or str(info.client) != EXPECTED_CLIENT:
        raise TcodeCreationError(
            f"Refusing to run: session is {info.system_name}/{info.client}, "
            f"expected {EXPECTED_SYSTEM}/{EXPECTED_CLIENT}."
        )


def create_report_transaction(
    controller: SAPGUIController,
    tcode: str,
    program: str,
    package: str,
    transport: str,
    short_text: str,
    webgui: bool = True,
    java: bool = True,
    windows: bool = True,
) -> dict:
    if not tcode.upper().startswith("ZFS_"):
        raise TcodeCreationError(
            f"Refusing to create {tcode!r}: does not match the ZFS_<NAME> "
            "transaction naming pattern (docs/naming-conventions.md). Run the "
            "naming gate by hand before overriding this script."
        )
    if len(short_text) > 36:
        raise TcodeCreationError(
            f"Short text {short_text!r} is {len(short_text)} chars, over the "
            "36-char TSTCT-TTEXT limit (silently fails otherwise)."
        )

    c = controller

    # -- SE93 is the only transaction this script ever executes. --
    c.execute_transaction("SE93")
    assert_dev_system(c)

    c.set_field("wnd[0]/usr/ctxtTSTC-TCODE", tcode)
    c.select_menu("wnd[0]/mbar/menu[0]/menu[0]")  # Transaction Code -> Create

    c.set_field("wnd[1]/usr/txtTSTCT-TTEXT", short_text)
    c.select_radio_button("wnd[1]/usr/subTTYPE:SAPLSEUK:0302/radRSSTCD-S_REPORT")
    c.press_button("wnd[1]/tbar[0]/btn[0]")  # Continue

    c.set_field("wnd[0]/usr/ctxtTSTC-PGMNA", program)
    c.select_checkbox("wnd[0]/usr/subCLASSIFICATION:SAPLSEUK:0370/chkTSTCC-S_WEBGUI", webgui)
    c.select_checkbox("wnd[0]/usr/subCLASSIFICATION:SAPLSEUK:0370/chkTSTCC-S_PLATIN", java)
    c.select_checkbox("wnd[0]/usr/subCLASSIFICATION:SAPLSEUK:0370/chkTSTCC-S_WIN32", windows)

    c.press_save()

    # Object Directory Entry popup - package assignment
    popup = c.get_popup_window()
    if not popup.get("popup_exists") or "Object Directory" not in (popup.get("title") or ""):
        raise TcodeCreationError(
            f"Expected the Object Directory Entry popup, saw: {popup.get('title')!r}. "
            "Stopping rather than guessing the next screen."
        )
    c.set_field("wnd[1]/usr/ctxtKO007-L_DEVCLASS", package)
    c.press_button("wnd[1]/tbar[0]/btn[0]")

    # Transport prompt - verify the pre-filled request before confirming
    popup = c.get_popup_window()
    if popup.get("popup_exists") and "transport" in (popup.get("title") or "").lower():
        trkorr_field = c.read_field("wnd[1]/usr/ctxtKO008-TRKORR")
        actual_trkorr = trkorr_field.get("value", "")
        if actual_trkorr and actual_trkorr != transport:
            raise TcodeCreationError(
                f"Transport prompt pre-filled {actual_trkorr!r}, expected "
                f"{transport!r} — refusing to blindly confirm a different transport."
            )
        c.press_button("wnd[1]/tbar[0]/btn[0]")

    save_screen = c.get_screen_info()

    # Live verification — separate from the save message, reads what SAP has now
    c.execute_transaction(f"/n{tcode}")
    verify_info = c.get_session_info()
    ok = verify_info.program == program

    return {
        "tcode": tcode,
        "program": program,
        "package": package,
        "transport": transport,
        "save_message": save_screen.get("message"),
        "verified_program": verify_info.program,
        "verified_screen": verify_info.screen_number,
        "ok": ok,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tcode", required=True)
    parser.add_argument("--program", required=True)
    parser.add_argument("--package", required=True)
    parser.add_argument("--transport", required=True)
    parser.add_argument("--short-text", required=True)
    parser.add_argument("--no-webgui", action="store_true", help="Uncheck 'SAP GUI for HTML'")
    parser.add_argument("--no-java", action="store_true", help="Uncheck 'SAP GUI for Java'")
    parser.add_argument("--no-windows", action="store_true", help="Uncheck 'SAP GUI for Windows'")
    parser.add_argument("--yes", action="store_true", help="Actually commit the save. Without it, nothing touches SAP.")
    args = parser.parse_args()

    print(f"About to create transaction {args.tcode!r} -> program {args.program!r}, "
          f"package {args.package!r}, transport {args.transport!r}.")

    # Argument-only validation always runs, even without --yes.
    if not args.tcode.upper().startswith("ZFS_"):
        print(f"REFUSED: {args.tcode!r} does not match the ZFS_<NAME> naming pattern.", file=sys.stderr)
        return 2
    if len(args.short_text) > 36:
        print(f"REFUSED: short text is {len(args.short_text)} chars, max 36.", file=sys.stderr)
        return 2

    if not args.yes:
        print("Validation passed. Not touching SAP (pass --yes to commit).")
        return 0

    controller = SAPGUIController()
    controller.connect_to_existing_session(0, 0)
    assert_dev_system(controller)

    try:
        result = create_report_transaction(
            controller,
            tcode=args.tcode,
            program=args.program,
            package=args.package,
            transport=args.transport,
            short_text=args.short_text,
            webgui=not args.no_webgui,
            java=not args.no_java,
            windows=not args.no_windows,
        )
    except Exception as exc:  # noqa: BLE001 - report and stop, no silent retry
        log({"event": "tcode_create_failed", "tcode": args.tcode, "error": str(exc)})
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1

    log({"event": "tcode_create_ok", **result})
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
