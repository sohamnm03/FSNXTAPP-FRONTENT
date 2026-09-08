"""One-shot SAP GUI login check used by the desktop Test Connection action."""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools" / "mcp-sap-gui" / ".venv" / "Lib" / "site-packages"))
from mcp_sap_gui.sap_controller import SAPGUIController  # noqa: E402


def main() -> int:
    controller = SAPGUIController()
    try:
        controller.connect(
            system_description=os.environ["SAP_TEST_LOGON_DESCRIPTION"],
            client=os.environ["SAP_TEST_CLIENT"],
            user=os.environ["SAP_TEST_USERNAME"],
            password=os.environ["SAP_TEST_PASSWORD"],
            language=os.environ.get("SAP_TEST_LANGUAGE", "EN"),
        )
        # SAP returns from connect() before the multiple-logon dialog is
        # resolved. Explicitly keep existing sessions alive, then wait for the
        # login screen to settle before reading the authenticated user.
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
        print(json.dumps({"connected": True, "user": user}))
        return 0
    except Exception as exc:
        print(json.dumps({"connected": False, "reason": str(exc)}))
        return 0
    finally:
        try:
            controller.disconnect()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
