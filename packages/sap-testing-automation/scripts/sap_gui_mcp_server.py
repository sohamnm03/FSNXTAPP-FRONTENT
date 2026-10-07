"""Start mcp-sap-gui with the workspace's configurable transaction denylist.

mcp-sap-gui 0.2.2 enforces ``ServerConfig.blocked_transactions`` but exposes
only its allowlist through command-line arguments. The generated MCP
configuration starts this launcher and supplies the effective denylist as JSON
in ``FSNXT_SAP_BLOCKED_TRANSACTIONS``.
"""
from __future__ import annotations

import json
import os
from typing import Any


ENV_NAME = "FSNXT_SAP_BLOCKED_TRANSACTIONS"


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

    try:
        blocked = configured_blocked_transactions()
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    if blocked is not None:
        # ServerConfig's default factory reads this module value when
        # mcp_sap_gui.server.main() constructs the active configuration.
        server._DEFAULT_BLOCKED_TRANSACTIONS = blocked
    server.main()


if __name__ == "__main__":
    main()
