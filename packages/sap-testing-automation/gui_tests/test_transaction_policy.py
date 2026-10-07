"""Regression tests for the shared SAP transaction denylist."""
import unittest

from gui_tests.session import GuiSession, TransactionRefused
from scripts.sap_gui_mcp_server import configured_blocked_transactions


class _Controller:
    def __init__(self):
        self.started = []

    def execute_transaction(self, tcode):
        self.started.append(tcode)
        return {"success": True}


class TransactionPolicyTests(unittest.TestCase):
    def session(self, *, blocked=(), allowed=None):
        session = GuiSession.__new__(GuiSession)
        session._blocked_transactions = {item.upper() for item in blocked}
        session._allowed_transactions = ({item.upper() for item in allowed}
                                         if allowed is not None else None)
        session.controller = _Controller()
        session.assert_dev_system = lambda _where: {
            "system": "DS4", "client": "100", "user": "TESTER",
        }
        return session

    def test_denylist_blocks_normalized_tcodes_but_allows_other_transactions(self):
        session = self.session(blocked={"SE16N", "SU53"})

        with self.assertRaisesRegex(TransactionRefused, "SE16N is blocked"):
            session.start_transaction("=/nse16n")

        self.assertEqual(session.start_transaction("ZCUSTOM"), {"success": True})
        self.assertEqual(session.controller.started, ["ZCUSTOM"])

    def test_optional_allowlist_remains_available_for_stricter_systems(self):
        session = self.session(blocked={"SU53"}, allowed={"MM03"})
        with self.assertRaisesRegex(TransactionRefused, "allowed-transactions"):
            session.start_transaction("VA03")
        session.start_transaction("MM03")

    def test_launcher_requires_a_non_empty_json_string_array(self):
        self.assertEqual(configured_blocked_transactions('["SU53", "SE16N"]'),
                         ["SU53", "SE16N"])
        for invalid in ("", "{}", "[]", '["SU53", 3]'):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    configured_blocked_transactions(invalid)


if __name__ == "__main__":
    unittest.main()
