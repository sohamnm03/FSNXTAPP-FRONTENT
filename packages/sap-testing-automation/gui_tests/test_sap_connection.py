from __future__ import annotations

import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools" / "mcp-sap-gui" / ".venv" / "Lib" / "site-packages"))
sys.path.insert(0, str(REPO_ROOT))

from mcp_sap_gui.models import VKey  # noqa: E402

from gui_tests.run import resolve_system  # noqa: E402
from gui_tests.sap_connection import (  # noqa: E402
    application_server_connection_string,
    configure_direct_connect,
    connect_by_application_server,
)


class FakeConnection:
    def __init__(self, session):
        self.session = session

    def Children(self, index):
        if index != 0:
            raise IndexError(index)
        return self.session


class FakeApplication:
    def __init__(self, connection):
        self.connection = connection
        self.calls = []

    def OpenConnectionByConnectionString(self, connection_string, sync):
        self.calls.append((connection_string, sync))
        return self.connection


class FakeController:
    def __init__(self):
        self.session = object()
        self.application = FakeApplication(FakeConnection(self.session))
        self.fields = []
        self.vkeys = []
        self._connection = None
        self._session = None
        self._owns_session = False

    def _get_application(self):
        return self.application

    def _safe_set_field(self, field_id, value):
        self.fields.append((field_id, value))

    def send_vkey(self, key):
        self.vkeys.append(key)

    def get_session_info(self):
        return {"connected": True}


class DirectSapConnectionTests(unittest.TestCase):
    def test_builds_direct_application_server_route(self):
        self.assertEqual(
            application_server_connection_string("10.40.1.33", "00"),
            "/H/10.40.1.33/S/3200",
        )

    def test_connect_uses_connection_string_and_fills_login_screen(self):
        controller = FakeController()

        result = connect_by_application_server(
            controller,
            application_server="10.110.0.33",
            system_number="01",
            client="100",
            user="FS_DEV3",
            password="secret",
            language="EN",
        )

        self.assertEqual(
            controller.application.calls,
            [("/H/10.110.0.33/S/3201", True)],
        )
        self.assertIs(controller._session, controller.session)
        self.assertTrue(controller._owns_session)
        self.assertEqual(
            controller.fields,
            [
                ("wnd[0]/usr/txtRSYST-MANDT", "100"),
                ("wnd[0]/usr/txtRSYST-BNAME", "FS_DEV3"),
                ("wnd[0]/usr/pwdRSYST-BCODE", "secret"),
                ("wnd[0]/usr/txtRSYST-LANGU", "EN"),
            ],
        )
        self.assertEqual(controller.vkeys, [VKey.ENTER])
        self.assertEqual(result, {"connected": True})

    def test_mcp_override_ignores_logon_description(self):
        class McpController(FakeController):
            pass

        configure_direct_connect(
            McpController,
            application_server="172.30.90.55",
            system_number="00",
        )
        controller = McpController()

        controller.connect(
            system_description="This SAP Logon entry does not exist",
            client="100",
        )

        self.assertEqual(
            controller.application.calls,
            [("/H/172.30.90.55/S/3200", True)],
        )

    def test_every_registry_system_resolves_direct_connection_metadata(self):
        expected = {
            "DS4_100_NIIF": ("10.40.1.33", "00"),
            "DS4_100_TFSIN": ("10.110.0.33", "00"),
            "LFD_100_LTFS": ("172.30.90.55", "00"),
        }

        for system_id, direct_target in expected.items():
            with self.subTest(system_id=system_id):
                _, _, _, login = resolve_system(system_id)
                self.assertEqual(
                    (login["application_server"], login["system_number"]),
                    direct_target,
                )
                self.assertNotIn("logon_description", login)


if __name__ == "__main__":
    unittest.main()
