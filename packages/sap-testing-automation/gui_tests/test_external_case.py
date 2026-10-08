"""Regression tests for the model-free external GUI case executor."""
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

from gui_tests.external_case import _same_number, _status_title_matches, execute


class _Controller:
    def read_field(self, _target):
        return {"value": ""}

    def get_screen_elements(self, **_kwargs):
        return [SimpleNamespace(
            id="wnd[0]/usr/txtVTG_INVEST-XZBETR",
            name="VTG_INVEST-XZBETR",
        )]


class _Sap:
    def __init__(self):
        self.controller = _Controller()
        self.tabs = []

    def assert_dev_system(self, _where):
        return {"system": "LFD", "client": "100", "user": "TESTER"}

    def start_transaction(self, _transaction):
        return {"success": True}

    def screen(self):
        return {
            "message_id": "00",
            "message_number": "055",
            "message": "Fill out all required entry fields",
            "title": "Create Interest Rate Instrument:",
        }

    def select_tab(self, target):
        self.tabs.append(target)
        return {"success": True}

    def press(self, _target):
        raise AssertionError("a tab must not be dispatched through press")

    def select_combobox(self, _target, _value):
        raise AssertionError("a tab must not be dispatched through select_combobox")


class ExternalCaseCompatibilityTests(unittest.TestCase):
    def test_noninteractive_express_information_is_recorded_and_dismissed(self):
        class ExpressSap(_Sap):
            def __init__(self):
                super().__init__()
                self.notice_open = False
                self.pressed = []
                self.transaction_attempts = 0
                self.current_transaction = "FTR_CREATE"

            def start_transaction(self, transaction):
                self.transaction_attempts += 1
                if self.transaction_attempts == 1:
                    self.notice_open = True
                else:
                    self.current_transaction = transaction
                return {"success": True}

            def screen(self):
                return {**super().screen(), "transaction": self.current_transaction}

            def popup(self):
                if not self.notice_open:
                    return {"popup_exists": False}
                return {
                    "popup_exists": True,
                    "title": "Express Information",
                    "has_inputs": False,
                    "texts": ["Background notification received"],
                    "buttons": [{
                        "id": "/app/con[2]/ses[0]/wnd[1]/tbar[0]/btn[0]",
                        "tooltip": "Continue   (Enter)",
                    }],
                }

            def press(self, target):
                self.pressed.append(target)
                self.notice_open = False
                return {"success": True}

        sap = ExpressSap()
        plan = {"steps": [
            {"action": "transaction", "label": "Open edit", "value": "FTR_EDIT"},
            {"action": "assert", "label": "Edit screen", "source": "status",
             "expected": "Create Interest Rate Instrument:", "match": "equals"},
        ]}

        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")

        self.assertEqual(result["verdict"], "PASS")
        self.assertEqual(sap.pressed, ["wnd[1]/tbar[0]/btn[0]"])
        self.assertEqual(sap.transaction_attempts, 2)
        notice = next(step for step in result["steps"]
                      if step["step"] == "Dismiss Express Information")
        self.assertIn("Background notification received", notice["detail"])

    def test_field_assertions_ignore_only_outer_sap_padding(self):
        class PaddedAmountController(_Controller):
            def read_field(self, _target):
                return {"value": " 100,000,000.00 "}

        sap = _Sap()
        sap.controller = PaddedAmountController()
        plan = {"steps": [{
            "action": "assert",
            "source": "field",
            "target": "wnd[0]/usr/txtVTG_INVEST-XZBETR",
            "expected": "100,000,000.00",
            "match": "equals",
            "label": "Amount round-trip",
        }]}

        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")
        self.assertEqual(result["verdict"], "PASS")
        self.assertEqual(result["assertions"][0]["observed"],
                         " 100,000,000.00 ")

        plan["steps"][0]["expected"] = "110,000,000.00"
        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")
        self.assertEqual(result["verdict"], "FAIL")

    def test_amount_assertions_compare_values_not_sap_display_format(self):
        class AmountController(_Controller):
            def __init__(self, shown):
                self.shown = shown

            def read_field(self, _target):
                return {"value": self.shown}

        cases = [
            ("1,000,000.00", "1000000", False, "PASS"),
            ("1000000", "1,000,000.00", False, "PASS"),
            ("10,00,000.50", "1000000.5", False, "PASS"),
            ("-1,000.00", "1,000.000-", False, "PASS"),
            ("1,000,000.00", "999999.99", False, "FAIL"),
            ("0010", "10", False, "FAIL"),
            ("0010", "10", True, "PASS"),
            ("01.10.2026", "1.10.2026", True, "FAIL"),
        ]
        for expected, shown, numeric, verdict in cases:
            with self.subTest(expected=expected, shown=shown, numeric=numeric):
                sap = _Sap()
                sap.controller = AmountController(shown)
                step = {
                    "action": "assert", "source": "field",
                    "target": "wnd[0]/usr/txtVTG_INVEST-XZBETR",
                    "expected": expected, "match": "equals",
                    "label": "Investment Amount confirmed",
                }
                if numeric:
                    step["numeric"] = True
                plan = {"steps": [step]}
                with tempfile.TemporaryDirectory() as directory:
                    result = execute(plan, sap, Path(directory) / "observations.json")
                self.assertEqual(result["verdict"], verdict)
                self.assertEqual(result["assertions"][0]["observed"], shown)

    def test_numeric_parser_handles_decimal_padding_signs_and_zero(self):
        self.assertTrue(_same_number("1,000,000.00", "1000000"))
        self.assertTrue(_same_number("1,000.5000-", "-1000.5"))
        self.assertTrue(_same_number("-0.000", "0"))
        self.assertFalse(_same_number("1,000,000.01", "1000000"))
        self.assertFalse(_same_number("10C", "10"))

    def test_padding_is_ignored_for_every_source_and_padding_width(self):
        for padded in ("150,000,000.00", " 150,000,000.00", "  150,000,000.00 ",
                       "\xa0150,000,000.00", "150,000,000.00\t"):
            for source in ("field", "value", "text", ""):
                class Padded(_Controller):
                    def read_field(self, _target, value=padded):
                        return {"value": value}

                sap = _Sap()
                sap.controller = Padded()
                plan = {"steps": [{
                    "action": "assert", "source": source,
                    "target": "wnd[0]/usr/txtVTG_INVEST-XZBETR",
                    "expected": " 150,000,000.00 ", "match": "equals",
                    "label": "Amount round-trip",
                }]}
                with tempfile.TemporaryDirectory() as directory:
                    result = execute(plan, sap, Path(directory) / "observations.json")
                self.assertEqual(result["verdict"], "PASS", (padded, source))
                self.assertEqual(result["assertions"][0]["observed"], padded)

    def test_fill_accepts_sap_formatting_of_the_same_number_only(self):
        class Formatted(_Controller):
            def __init__(self, shown):
                self.shown = shown

            def set_field(self, _target, _value):
                return {"success": True}

            def read_field(self, _target):
                return {"value": self.shown}

        cases = [("150000000", " 150,000,000.00", "PASS"),
                 ("7", "7.0000000 ", "PASS"),
                 ("150000000", "15,000,000.00", "FAIL"),
                 ("0010", "10", "FAIL"),
                 ("10C", " 10C", "PASS"),
                 ("10C", "10", "FAIL"),
                 ("01.10.2026", "1.10.2026", "FAIL")]
        for sent, shown, verdict in cases:
            sap = _Sap()
            sap.controller = Formatted(shown)
            plan = {"steps": [
                {"action": "fill", "target": "wnd[0]/usr/txtVTG_INVEST-XZBETR",
                 "value": sent, "label": "Set field"},
            ]}
            with tempfile.TemporaryDirectory() as directory:
                result = execute(plan, sap, Path(directory) / "observations.json")
            # A fill-only plan has no recorded assertion of its own, so a
            # passing read-back still ends FAIL on "Missing assertions".
            self.assertEqual(result["assertions"][0]["result"],
                             "pass" if verdict == "PASS" else "fail", (sent, shown))

    def test_text_assertion_reads_alv_cells_instead_of_com_type_name(self):
        class GridController(_Controller):
            def read_field(self, _target):
                return {"value": "SAPGUI.GridViewCtrl.1", "type": "GuiShell"}

            def read_table(self, _target, max_rows=100):
                self.max_rows = max_rows
                return {
                    "table_type": "GuiGridView",
                    "data": [{
                        "XBEWART": "Borrowing / Increase",
                        "BZBETR_SIGNED": " 100,000,000.00",
                        "_absolute_row_index": 0,
                    }],
                }

        class GridSap(_Sap):
            def __init__(self):
                super().__init__()
                self.controller = GridController()

            def read_table(self, target, max_rows=100):
                return self.controller.read_table(target, max_rows=max_rows)

        sap = GridSap()
        grid = "wnd[0]/usr/cntlCASH_FLOWS/shellcont/shell"
        plan = {"steps": [
            {"action": "assert", "source": "text", "target": grid,
             "expected": "Borrowing / Increase", "match": "contains",
             "label": "Borrowing/Increase flow type present"},
            {"action": "assert", "source": "text", "target": grid,
             "expected": "100,000,000.00", "match": "contains",
             "label": "Cash-flow amount present"},
        ]}

        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")

        self.assertEqual(result["verdict"], "PASS")
        self.assertEqual(sap.controller.max_rows, 100)
        self.assertIn("XBEWART=Borrowing / Increase",
                      result["assertions"][0]["observed"])
        self.assertNotIn("SAPGUI.GridViewCtrl.1",
                         result["assertions"][0]["observed"])

    def test_legacy_tab_actions_and_structured_status_are_compatible(self):
        """Existing TFSIN/LTFS sidecars run without being regenerated."""
        sap = _Sap()
        admin_tab = "wnd[0]/usr/tabsMAIN/tabpADMIN"
        data_tab = "wnd[0]/usr/tabsMAIN/tabpADDITIONAL"
        plan = {
            "steps": [
                {"action": "transaction", "value": "FTR_CREATE", "label": "Open"},
                {"action": "press", "target": admin_tab, "label": "Legacy pressed tab"},
                {"action": "select", "target": data_tab, "value": "ADDITIONAL",
                 "label": "Legacy selected tab"},
                {"action": "assert", "source": "status", "expected": "00 055",
                 "match": "contains", "label": "Message code"},
                {"action": "assert", "source": "status",
                 "expected": "Create Interest Rate Instrument: Structure",
                 "match": "contains", "label": "Screen title"},
                {"action": "assert", "source": "field",
                 "target": "wnd[0]/usr/txtVTG_INVEST-XZBETR",
                 "expected": "", "label": "Structure field exists"},
            ],
        }

        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")

        self.assertEqual(result["verdict"], "PASS")
        self.assertEqual(sap.tabs, [admin_tab, data_tab])
        self.assertTrue(all(item["result"] == "pass"
                            for item in result["assertions"]))

    def test_status_equals_matches_one_component_of_the_observation(self):
        """A rerun observes 'PROGRAM / SCREEN | title'; equals targets the title."""
        sap = _Sap()
        sap.screen = lambda: {"program": "SAPLFTR_IRATE", "screen_number": "1100",
                              "title": "Create Interest Rate Instrument: Structure"}
        plan = {"steps": [
            {"action": "assert", "source": "status",
             "expected": "Create Interest Rate Instrument: Structure",
             "match": "equals", "label": "Landed on Structure screen"},
        ]}
        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")
        self.assertEqual(result["verdict"], "PASS")

        sap.screen = lambda: {"program": "SAPLFTR_IRATE", "screen_number": "1100",
                              "title": "Change Interest Rate Instrument: Structure"}
        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")
        self.assertNotEqual(result["verdict"], "PASS")

    def test_status_title_fallback_does_not_match_another_screen(self):
        actual = "00 055 | Fill out all required entry fields | Create Interest Rate Instrument:"
        self.assertTrue(_status_title_matches(
            "Create Interest Rate Instrument: Structure", actual))
        self.assertFalse(_status_title_matches(
            "Process Financial Transaction: Structure", actual))

    def test_drifted_container_path_resolves_by_unique_technical_name(self):
        class DriftController(_Controller):
            actual = "wnd[0]/usr/subNEW:SAPLFTR_IRATE:9999/txtVTG_INVEST-XZBETR"

            def __init__(self):
                self.value = ""

            def set_field(self, target, value):
                if target != self.actual:
                    return {"error": "The control could not be found by id."}
                self.value = value
                return {"status": "success"}

            def read_field(self, target):
                if target != self.actual:
                    return {"error": "The control could not be found by id."}
                return {"value": self.value}

            def get_screen_elements(self, **_kwargs):
                return [SimpleNamespace(
                    id=f"/app/con[0]/ses[0]/{self.actual}",
                    name="VTG_INVEST-XZBETR",
                )]

        sap = _Sap()
        sap.controller = DriftController()
        plan = {"steps": [{
            "action": "fill",
            "target": "wnd[0]/usr/tabsOLD/subOLD/txtVTG_INVEST-XZBETR",
            "value": "60000000",
            "label": "Set Amount",
        }]}

        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")

        self.assertEqual(result["verdict"], "PASS")
        self.assertEqual(sap.controller.value, "60000000")

    def test_missing_child_activates_its_recorded_tab_before_setting(self):
        class TabController(_Controller):
            target = "wnd[0]/usr/tabsMAIN/tabpMMFD01/subFORM/txtVTG_INVEST-XZBETR"

            def __init__(self):
                self.active = False
                self.value = ""

            def set_field(self, target, value):
                if target != self.target or not self.active:
                    return {"error": "The control could not be found by id."}
                self.value = value
                return {"status": "success"}

            def read_field(self, target):
                if target != self.target or not self.active:
                    return {"error": "The control could not be found by id."}
                return {"value": self.value}

            def get_screen_elements(self, **_kwargs):
                if not self.active:
                    return []
                return [SimpleNamespace(
                    id=self.target,
                    name="VTG_INVEST-XZBETR",
                )]

        class TabSap(_Sap):
            def __init__(self):
                super().__init__()
                self.controller = TabController()

            def select_tab(self, target):
                self.tabs.append(target)
                self.controller.active = target.endswith("/tabpMMFD01")
                return {"success": self.controller.active}

        sap = TabSap()
        plan = {"steps": [{
            "action": "fill",
            "target": sap.controller.target,
            "value": "60000000",
            "label": "Set Amount",
        }]}

        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")

        self.assertEqual(result["verdict"], "PASS")
        self.assertEqual(sap.tabs, ["wnd[0]/usr/tabsMAIN/tabpMMFD01"])
        self.assertEqual(sap.controller.value, "60000000")

    def test_express_information_is_acknowledged_and_recorded(self):
        class ExpressController(_Controller):
            def __init__(self, sap):
                self.sap = sap
                self.value = ""

            def set_field(self, target, value):
                if self.sap.express:
                    return {"error": "The control could not be found by id."}
                self.value = value
                return {"status": "success"}

            def read_field(self, target):
                return {"value": self.value}

            def get_screen_elements(self, **_kwargs):
                return []

        class ExpressSap(_Sap):
            def __init__(self):
                super().__init__()
                self.express = True
                self.keys = []
                self.controller = ExpressController(self)

            def screen(self):
                if self.express:
                    return {"program": "SAPMSSY0", "screen_number": "120"}
                return {"program": "FTR_ENTRY", "screen_number": "1000"}

            def popup(self):
                return {"text": "Update successful"}

            def send(self, vkey):
                self.keys.append(vkey)
                self.express = False
                return {"success": True}

        sap = ExpressSap()
        plan = {"steps": [
            {"action": "fill", "label": "Company Code", "value": "IDF",
             "target": "wnd[0]/usr/ctxtFTR_ENTRY-BUKRS"},
            {"action": "assert", "label": "Company Code", "source": "field",
             "target": "wnd[0]/usr/ctxtFTR_ENTRY-BUKRS", "expected": "IDF"},
        ]}

        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")

        self.assertEqual(result["verdict"], "PASS")
        self.assertEqual(sap.keys, [0])
        self.assertIn("Update successful", result["deviations"][0])

    def test_a_field_that_is_off_does_not_stop_the_run(self):
        class Fields(_Controller):
            def __init__(self):
                self.values = {}

            def set_field(self, target, value):
                if target.endswith("MISSING"):
                    return {"error": "The control could not be found by id."}
                self.values[target] = value
                return {"status": "success"}

            def read_field(self, target):
                if target.endswith("MISSING"):
                    return {"error": "The control could not be found by id."}
                return {"value": self.values.get(target, "")}

            def get_screen_elements(self, **_kwargs):
                return []

        class FieldSap(_Sap):
            def __init__(self):
                super().__init__()
                self.controller = Fields()
                self.keys = []

            def send(self, vkey):
                self.keys.append(vkey)
                return {"success": True}

        sap = FieldSap()
        plan = {"steps": [
            {"action": "fill", "label": "Missing field", "value": "200",
             "target": "wnd[0]/usr/ctxtMISSING"},
            {"action": "fill", "label": "Amount", "value": "100",
             "target": "wnd[0]/usr/txtAMOUNT"},
            {"action": "assert", "label": "Wrong expectation", "source": "field",
             "target": "wnd[0]/usr/txtAMOUNT", "expected": "999"},
            {"action": "key", "label": "Enter", "value": "0"},
            {"action": "assert", "label": "Amount kept", "source": "field",
             "target": "wnd[0]/usr/txtAMOUNT", "expected": "100"},
        ]}

        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")

        self.assertEqual(result["verdict"], "FAIL")
        self.assertEqual([step["outcome"] for step in result["steps"]],
                         ["error", "ok", "error", "ok", "ok"])
        self.assertEqual(sap.keys, [0], "steps after a failed field still run")
        self.assertIn("2 of 5 steps did not pass", result["summary"])
        self.assertEqual(len(result["deviations"]), 2)

    def test_a_failed_write_still_stops_the_run(self):
        class SaveSap(_Sap):
            def __init__(self):
                super().__init__()
                self.keys = []

            def send(self, vkey):
                self.keys.append(vkey)
                return {"error": "Save could not be sent"} if vkey == 11 else {"success": True}

        sap = SaveSap()
        plan = {"steps": [
            {"action": "key", "label": "Save", "value": "11", "write": True},
            {"action": "key", "label": "After save", "value": "0"},
            {"action": "assert", "label": "Saved", "source": "status",
             "expected": "created", "match": "contains", "verifiesWrite": True},
        ]}

        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")

        self.assertEqual(result["verdict"], "FAIL")
        self.assertEqual(sap.keys, [11], "nothing runs after a write whose outcome is unknown")

    def test_one_screenshot_per_screen_taken_before_leaving_it(self):
        class Camera(_Controller):
            def __init__(self):
                self.values = {}

            def set_field(self, target, value):
                if target.endswith("MISSING"):
                    return {"error": "The control could not be found by id."}
                self.values[target] = value
                return {"status": "success"}

            def read_field(self, target):
                return {"value": self.values.get(target, "")}

            def get_screen_elements(self, **_kwargs):
                return []

            def take_screenshot(self, filepath):
                Path(filepath).write_bytes(b"png")
                return {"filepath": filepath}

        class CameraSap(_Sap):
            def __init__(self):
                super().__init__()
                self.controller = Camera()
                self.title = "Entry"

            def screen(self):
                return {"title": self.title}

            def send(self, vkey):
                self.title = "Structure"
                return {"success": True}

        sap = CameraSap()
        plan = {"steps": [
            {"action": "fill", "label": "Company Code", "value": "LTFH", "target": "wnd[0]/usr/txtBUKRS"},
            {"action": "key", "label": "Enter", "value": "0"},
            {"action": "fill", "label": "Start date", "value": "01.01.2026", "target": "wnd[0]/usr/txtSTART"},
            {"action": "fill", "label": "End date", "value": "01.01.2027", "target": "wnd[0]/usr/txtEND"},
            {"action": "fill", "label": "Missing", "value": "1", "target": "wnd[0]/usr/txtMISSING"},
            {"action": "assert", "label": "Amount kept", "source": "field",
             "target": "wnd[0]/usr/txtSTART", "expected": "01.01.2026"},
        ]}

        with tempfile.TemporaryDirectory() as directory:
            result = execute(plan, sap, Path(directory) / "observations.json")
            files = sorted(path.name for path in (Path(directory) / "evidence").iterdir())

        self.assertEqual(files, ["screen-01.png", "screen-02.png"])
        self.assertEqual([(row["file"], row["steps"], row["screen"]) for row in result["evidence"]],
                         [("screen-01.png", [1], "Entry"),
                          ("screen-02.png", [2, 3, 4, 5, 6], "Structure")])

if __name__ == "__main__":
    unittest.main()
