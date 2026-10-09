"""Open SAP GUI connections directly from registry RFC metadata."""
from __future__ import annotations

import logging
import re
from typing import Any

from mcp_sap_gui.models import SAPGUIError, VKey


logger = logging.getLogger(__name__)
_SYSTEM_NUMBER = re.compile(r"^\d{2}$")


def application_server_connection_string(
    application_server: str,
    system_number: str,
) -> str:
    """Return the SAP GUI direct connection string for an application server."""
    host = str(application_server or "").strip()
    number = str(system_number or "").strip()
    if not host or "/" in host or any(character.isspace() for character in host):
        raise ValueError("application_server must be a host name or IP address")
    if not _SYSTEM_NUMBER.fullmatch(number):
        raise ValueError("system_number must contain exactly two digits")
    return f"/H/{host}/S/32{number}"


def connect_by_application_server(
    controller: Any,
    *,
    application_server: str,
    system_number: str,
    client: str | None = None,
    user: str | None = None,
    password: str | None = None,
    language: str | None = None,
):
    """Connect and optionally log in without depending on SAP Logon entries."""
    connection_string = application_server_connection_string(
        application_server,
        system_number,
    )
    try:
        application = controller._get_application()
        logger.info("Opening direct SAP GUI connection to: %s", connection_string)
        controller._connection = application.OpenConnectionByConnectionString(
            connection_string,
            True,
        )
        controller._owns_session = True
        if controller._connection is None:
            raise SAPGUIError("Failed to open the direct SAP GUI connection")

        controller._session = controller._connection.Children(0)
        if controller._session is None:
            raise SAPGUIError("No session is available on the direct SAP GUI connection")

        if client:
            controller._safe_set_field("wnd[0]/usr/txtRSYST-MANDT", str(client))
        if user:
            controller._safe_set_field("wnd[0]/usr/txtRSYST-BNAME", user)
        if password:
            controller._safe_set_field("wnd[0]/usr/pwdRSYST-BCODE", password)
        if language:
            controller._safe_set_field("wnd[0]/usr/txtRSYST-LANGU", language)
        if password is not None:
            controller.send_vkey(VKey.ENTER)

        logger.info(
            "Connected directly to SAP application server %s as %s",
            application_server,
            user or "(existing credentials)",
        )
        return controller.get_session_info()
    except SAPGUIError:
        raise
    except Exception as exc:
        logger.warning(
            "Direct SAP GUI connection to '%s' failed: %s",
            application_server,
            exc,
            exc_info=logger.isEnabledFor(logging.DEBUG),
        )
        raise SAPGUIError(
            "Direct SAP GUI connection failed. Verify the application server, "
            "system number, and login screen state."
        ) from exc


def configure_direct_connect(
    controller_class: type,
    *,
    application_server: str,
    system_number: str,
) -> None:
    """Make an MCP controller's ``connect`` method use one configured server."""
    application_server_connection_string(application_server, system_number)

    def connect(
        controller,
        system_description: str | None = None,
        client: str | None = None,
        user: str | None = None,
        password: str | None = None,
        language: str | None = None,
    ):
        # mcp-sap-gui 0.2.2 still requires system_description in its tool schema.
        # It is intentionally ignored: each generated MCP server is bound to the
        # application server and system number from config/sap-systems.json.
        del system_description
        return connect_by_application_server(
            controller,
            application_server=application_server,
            system_number=system_number,
            client=client,
            user=user,
            password=password,
            language=language,
        )

    controller_class.connect = connect
