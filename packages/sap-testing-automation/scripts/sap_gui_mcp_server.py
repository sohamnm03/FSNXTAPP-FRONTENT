"""Start mcp-sap-gui with workspace connection and transaction settings.

mcp-sap-gui 0.2.2 enforces ``ServerConfig.blocked_transactions`` but exposes
only its allowlist through command-line arguments. The generated MCP
configuration starts this launcher and supplies the effective denylist as JSON
in ``FSNXT_SAP_BLOCKED_TRANSACTIONS``. Fresh connections are bound to the
registry's application server instead of an SAP Logon Pad description.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


ENV_NAME = "FSNXT_SAP_BLOCKED_TRANSACTIONS"
APPLICATION_SERVER_ENV = "SAP_APPLICATION_SERVER"
SYSTEM_NUMBER_ENV = "SAP_SYSTEM_NUMBER"


def configured_blocked_transactions(raw: str | None = None) -> list[str] | None:
    """Parse the configured denylist, returning ``None`` when it is not set."""
    value = os.environ.get(ENV_NAME) if raw is None else raw
    if value is None:
        return None
    try:
        parsed: Any = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{ENV_NAME} must contain a JSON array: {exc.msg}") from exc
    if not isinstance(parsed, list) or not parsed:
        raise ValueError(f"{ENV_NAME} must contain a non-empty JSON array")
    if any(not isinstance(item, str) or not item.strip() for item in parsed):
        raise ValueError(f"{ENV_NAME} entries must be non-empty strings")
    return parsed


def main() -> None:
    from mcp_sap_gui import server
    from mcp_sap_gui.sap_controller import SAPGUIController

    from gui_tests.sap_connection import configure_direct_connect

    try:
        blocked = configured_blocked_transactions()
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    if blocked is not None:
        # ServerConfig's default factory reads this module value when
        # mcp_sap_gui.server.main() constructs the active configuration.
        server._DEFAULT_BLOCKED_TRANSACTIONS = blocked
    application_server = os.environ.get(APPLICATION_SERVER_ENV, "")
    system_number = os.environ.get(SYSTEM_NUMBER_ENV, "")
    if not application_server or not system_number:
        raise SystemExit(
            f"{APPLICATION_SERVER_ENV} and {SYSTEM_NUMBER_ENV} must be configured"
        )
    configure_direct_connect(
        SAPGUIController,
        application_server=application_server,
        system_number=system_number,
    )
    server.main()


if __name__ == "__main__":
    main()
