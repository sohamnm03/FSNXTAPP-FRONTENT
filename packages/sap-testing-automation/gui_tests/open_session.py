"""Open a brand-new SAP GUI session and log in, then exit leaving it open.

Sibling of test_connection.py, which does the same connect() but disconnects
again in its `finally` — this one is for the desktop app's "Run interactively"
action on an external (no frozen-script) test case: the app needs a real,
logged-on session sitting in SAP Logon Pad before it hands off to the AI
Assistant, which then attaches to it with sap_connect_existing (CLAUDE.md
rule 2) rather than guessing whether one is already open.

Same convention gui_tests/session.py's GuiSession.login() already uses for
every frozen-script GUI-lane run: `sap_connect`, not `sap_connect_existing` —
opens a session alongside whatever is already logged on, never attaches to it
and never logs it off (CLAUDE.md rule 2/9).
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools" / "mcp-sap-gui" / ".venv" / "Lib" / "site-packages"))
from mcp_sap_gui.sap_controller import SAPGUIController  # noqa: E402
import pythoncom  # noqa: E402


def main() -> int:
    pythoncom.CoInitialize()
    controller = SAPGUIController()
    try:
        controller.connect(
            system_description=os.environ["SAP_TEST_LOGON_DESCRIPTION"],
            client=os.environ["SAP_TEST_CLIENT"],
            user=os.environ["SAP_TEST_USERNAME"],
            password=os.environ["SAP_TEST_PASSWORD"],
            language=os.environ.get("SAP_TEST_LANGUAGE", "EN"),
        )
        # connect() returns before SAP's multiple-logon dialog is resolved —
        # answer it the same way session.py does (keep every other session
        # alive, continue with this new one), then wait for login to settle.
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            popup = controller.get_popup_window()
            if popup.get("popup_exists"):
                title = str(popup.get("title", ""))
                names = {str(e.get("name", "")) for e in popup.get("interactive_elements", [])}
                if title == "License Information for Multiple Logons" and "MULTI_LOGON_OPT2" in names:
                    window_id = popup["window_id"]
                    controller.select_radio_button(f"{window_id}/usr/radMULTI_LOGON_OPT2")
                    controller.handle_popup(action="press", button_text="Confirm Selection")
                    time.sleep(1)
                    continue
                text = str(popup.get("text", "") or popup.get("message", ""))
                raise RuntimeError(text or f"SAP login popup: {title or 'unknown popup'}")
            info = controller.get_session_info()
            if str(getattr(info, "user", "") or ""):
                break
            time.sleep(0.5)
        else:
            info = controller.get_session_info()
        user = str(getattr(info, "user", "") or "")
        if not user:
            raise RuntimeError("SAP login did not reach an authenticated session.")
        # No disconnect() — the session is left open for the AI Assistant's
        # own MCP session to attach to next.
        print(json.dumps({"connected": True, "user": user}))
        return 0
    except Exception as exc:
        print(json.dumps({"connected": False, "reason": str(exc) or exc.__class__.__name__}))
        return 0
    finally:
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    raise SystemExit(main())
