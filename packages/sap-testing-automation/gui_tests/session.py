"""
The GUI lane's driver — `SAPGUIController` with the run's safety rules wrapped
around it.

`sap-gui`'s MCP server is a thin protocol wrapper around a plain, importable
class (`mcp_sap_gui.sap_controller.SAPGUIController`). A frozen script does not
need the protocol layer and does not need a model in the loop: it imports that
class and drives it, the same way `scripts/run-case.ps1` drives Playwright
directly rather than through a browser-automation model.

What this module adds on top of the raw controller is everything TC-014's
model-driven run had to do by hand, and which a script must therefore do
deliberately:

  - **Rule 1, enforced not assumed.** `assert_dev_system()` reads the session
    and refuses anything that is not the expected system/client. It is called
    before the first write and again at every t-code.
  - **Read-back on every field that matters.** `set_field_verified()` sets,
    re-reads, and compares — the GUI-lane equivalent of the web lane's
    `setFieldVerified`. TC-014's result file marks four fields `NOT OBSERVED`
    precisely because nothing did this.
  - **Check-run popups confirmed only at 0 terminations / 0 errors**, with the
    counters read off the toolbar rather than the message text.
  - **Test Run checkboxes driven false and read back** (CLAUDE.md rule 3a),
    never driven true first.
  - **COM disconnect treated as unknown-state, not failed-state.** This is the
    failure mode TC-014 hit mid-settle, and the one a script is most likely to
    get wrong: the tool call returns a *connection* error, not a SAP message, so
    "did the write land?" cannot be inferred from it. `write_guarded()` makes
    the caller supply a read-only verification callback, and will not retry a
    write without one.
"""
from __future__ import annotations

import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
_VENDORED = REPO_ROOT / "tools" / "mcp-sap-gui" / ".venv" / "Lib" / "site-packages"
if _VENDORED.is_dir() and str(_VENDORED) not in sys.path:
    sys.path.insert(0, str(_VENDORED))

from mcp_sap_gui.models import VKey  # noqa: E402
from mcp_sap_gui.sap_controller import SAPGUIController  # noqa: E402

from .journal import Journal  # noqa: E402


class WriteRefused(Exception):
    """A save/post was refused by SAP. The run recorded it; nothing committed."""


class SystemMismatch(Exception):
    """Rule 1 failed: this is not the system the case is allowed to drive."""


class ComDisconnected(Exception):
    """
    The COM transport dropped. The state of any in-flight write is UNKNOWN.

    Distinct from a SAP application error on purpose — see `write_guarded`.
    """


#: Substrings that mark a COM/RPC transport failure rather than a SAP error.
#: TC-014 saw `-2147417848` ("The object invoked has disconnected from its
#: clients") immediately after a Save. Matching on the message keeps this
#: working across pywin32's varying exception shapes.
_COM_DROP_MARKERS = (
    "disconnected from its clients",
    "-2147417848",
    "0x80010108",
    "rpc server is unavailable",
    "-2147023174",
    "the object invoked has disconnected",
    "call was rejected by callee",
    "-2147418111",
)


def _is_com_drop(exc: BaseException) -> bool:
    text = f"{exc}".lower()
    return any(marker in text for marker in _COM_DROP_MARKERS)


@dataclass
class CheckRun:
    """The counters off a check-run dialog's toolbar."""
    terminations: int
    errors: int
    warnings: int
    information: int
    messages: tuple[str, ...]

    @property
    def clean(self) -> bool:
        """The only condition under which a check-run dialog may be confirmed."""
        return self.terminations == 0 and self.errors == 0

    def __str__(self) -> str:
        return (f"{self.terminations} terminations, {self.errors} errors, "
                f"{self.warnings} warnings, {self.information} information")


class GuiSession:
    """A live SAP GUI session, with this workspace's rules wrapped around it."""

    def __init__(self, journal: Journal, expect_system: str, expect_client: str,
                 evidence_dir: Path | None = None):
        self.journal = journal
        self.expect_system = expect_system
        self.expect_client = expect_client
        self.evidence_dir = evidence_dir or (REPO_ROOT / "evidence" / journal.system_id)
        self.controller = SAPGUIController()
        self._attached = False

    # ------------------------------------------------------------ connection

    def attach(self) -> dict:
        """
        Attach to the session already open in SAP Logon.

        `sap_connect_existing`, not `sap_connect`: CLAUDE.md rule 2 — attaching
        to what is open is the only mode where the human can see what is being
        driven. Opening a second session is a rule-9 decision, not a script's.
        """
        self.controller.connect_to_existing_session(0, 0)
        self._attached = True
        return self.session_info()

    def reattach(self) -> dict:
        """
        Re-establish COM after a drop.

        The controller caches the scripting engine and the session object; both
        are dead after a disconnect, so they are cleared before reconnecting or
        the reconnect hands back the same corpse.
        """
        c = self.controller
        c._sap_gui_auto = None
        c._application = None
        c._connection = None
        c._session = None
        c.connect_to_existing_session(0, 0)
        return self.session_info()

    def session_info(self) -> dict:
        info = self.controller.get_session_info()
        return {
            "system": info.system_name,
            "client": info.client,
            "user": info.user,
            "transaction": info.transaction,
            "program": info.program,
            "screen_number": info.screen_number,
        }

    def assert_dev_system(self, where: str) -> dict:
        """
        CLAUDE.md rule 1. Called before the first write and at every t-code.

        `ok` from a connect call is not "logged on" — an empty user means the
        logon screen. Both facts are read here, and both are recorded, including
        when the check fails, because what the screen said is evidence.
        """
        info = self.session_info()
        ok = (info["system"] == self.expect_system
              and info["client"] == self.expect_client
              and bool(info["user"]))
        self.journal.system_confirmed(
            where, info["system"], info["client"], info["user"], confirmed=ok,
        )
        if not ok:
            raise SystemMismatch(
                f"{where}: expected {self.expect_system}/{self.expect_client} with a "
                f"logged-on user, got {info['system']}/{info['client']} "
                f"user={info['user']!r}. Refusing to continue."
            )
        return info

    # -------------------------------------------------------------- screens

    def start_transaction(self, tcode: str) -> dict:
        result = self.controller.execute_transaction(tcode)
        self.assert_dev_system(tcode)
        return result

    def screen(self) -> dict:
        return self.controller.get_screen_info()

    def status_message(self) -> str:
        return str(self.screen().get("message") or "")

    def send(self, vkey: int) -> dict:
        return self.controller.send_vkey(vkey)

    def enter(self) -> dict:
        return self.controller.send_vkey(VKey.ENTER)

    def press(self, button_id: str) -> dict:
        return self.controller.press_button(button_id)

    def select_tab(self, tab_id: str) -> dict:
        return self.controller.select_tab(tab_id)

    # --------------------------------------------------------------- fields

    def read_field(self, field_id: str) -> str:
        """
        A field's value as it reads on screen. `''` means genuinely empty.

        The controller returns `value` on success and an `error` key on failure,
        and both used to collapse to `''` here — so an element id that no longer
        exists was indistinguishable from a field SAP had left blank, and the run
        file rendered both as `NOT OBSERVED`. A drifted id is a rule-4 problem and
        must not read as an innocuous blank, so the failure is recorded as a
        deviation (which the freeze gate counts) instead of vanishing. The return
        stays `''` so no caller starts treating an unreadable field as a value.
        """
        result = self.controller.read_field(field_id)
        error = result.get("error")
        if error:
            self.journal.deviation(f"Could not read {field_id}: {error}")
            return ""
        return str(result.get("value", ""))

    def set_field(self, field_id: str, value: Any) -> None:
        self.controller.set_field(field_id, str(value))

    def set_field_verified(self, field_id: str, value: Any, label: str = "",
                           attempts: int = 3) -> str:
        """
        Set a field, read it back, and confirm it took.

        The web lane needs this because ITS drops leading keystrokes. The GUI
        lane needs it for a different reason: TC-014 set four fields and never
        re-read any of them, so its run file reports them `NOT OBSERVED` — the
        run could not say what the deal actually held. Reading back is what
        turns "we typed 100000" into "the field contains 100000".

        SAP reformats numeric and date fields on entry (`100000` becomes
        `100,000.00`), so equality is checked loosely: a read-back that contains
        the same digits counts. The *recorded* value is always the raw string
        off the screen, never the value that was sent.
        """
        name = label or field_id.rsplit("/", 1)[-1]
        last = ""
        for attempt in range(1, attempts + 1):
            self.controller.set_field(field_id, str(value))
            last = self.read_field(field_id)
            if _same_value(last, value):
                return last
            time.sleep(0.2)
        raise AssertionError(
            f"{name}: set {value!r} but the field reads {last!r} after {attempts} attempts"
        )

    def select_checkbox(self, checkbox_id: str, selected: bool) -> None:
        self.controller.select_checkbox(checkbox_id, selected)

    def read_checkbox(self, checkbox_id: str) -> bool | None:
        """
        Whether a checkbox is ticked, read off the live control.

        `mcp_sap_gui` 0.2.2 exposes no checkbox state anywhere: `read_field`
        returns the control's `Text` (its *label*, not its state) and
        `get_screen_elements` omits `Selected` entirely — so this reads the COM
        property directly. `reconnect()` already reaches the controller's private
        session, so this adds no coupling that was not there.

        `None` means the property could not be read. Callers must treat that as
        unknown, never as false.
        """
        try:
            return bool(self.controller._find_element(checkbox_id).Selected)
        except Exception:
            return None

    def set_test_run_off(self, checkbox_id: str, where: str) -> None:
        """
        Drive a Test Run checkbox to false and **read it back** (CLAUDE.md rule 3a).

        TBB1, TPM44 and TPM1 all default this to ON. Left alone, a "post"
        simulates, reports success and writes nothing. It is never driven to
        `true` first — there is no simulation pass in this workspace.

        The read-back is the whole point, and it was missing: this recorded
        `"false (driven, not defaulted)"` as an unconditional pass without ever
        looking at the control. The setter's result was discarded, so a drifted
        id — which returns an `error` dict, not an exception — left the checkbox
        ON, ran a simulation, and had the run file report a live post. That is
        precisely the failure rule 3a exists to prevent, and the hardcoded
        "observed" string also invented a result (rule 6). Found 2026-08-19 while
        auditing the same defect class as the combobox echo bug; the vendored
        setter's lowercase `element.selected = ...` is a second reason not to
        trust it unread.

        Refuses the run rather than continuing whenever OFF cannot be proven.
        """
        before = self.read_checkbox(checkbox_id)
        self.controller.select_checkbox(checkbox_id, False)
        after = self.read_checkbox(checkbox_id)

        if after is None:
            raise WriteRefused(
                f"{where}: the Test Run checkbox could not be read back, so it cannot "
                f"be proven OFF. Refusing to run — a simulated post reports success and "
                f"writes nothing (CLAUDE.md rule 3a). Re-discover {checkbox_id} with "
                f"sap_get_screen_elements."
            )
        if after:
            raise WriteRefused(
                f"{where}: Test Run is still ON after being driven to false. Refusing to "
                f"run — this would simulate, report success, and write nothing."
            )

        was = "ON" if before else "OFF" if before is not None else "unreadable"
        self.journal.check(f"{where} Test Run cleared before the live run",
                           "false", f"false (read back off the control; was {was})", "pass")

    def select_combobox(self, combobox_id: str, key_or_value: str) -> str:
        """
        Pick a dropdown entry by key or visible label; returns the label the
        control actually holds afterwards.

        Resolved from the control's own `current_key`, never from the setter's
        echo. `mcp_sap_gui.fields.select_combobox_entry` returns a `value` only
        on its text-search fallback: when `Key = key_or_value` succeeds directly
        — which is every call that passes a *key*, such as TC-015's Interest Cat.
        `"2"` and Frequency `"3"` — the result dict carries no `value` at all, so
        `result.get("value", "")` recorded `''` against a field SAP had set
        correctly, and the case failed its own assertion with `observed ''`
        (run 20260819-201615, no deal written). Callers that pass a visible label
        were never affected and keep recording the identical string: both paths
        report `entry.Value` out of the same Entries collection, so the strict
        equality in TC-014's General Valuation Class and TPM1's Valuation
        Category assertions still holds.
        """
        result = self.controller.select_combobox_entry(combobox_id, key_or_value)
        if result.get("error"):
            raise WriteRefused(
                f"Could not select {key_or_value!r} in {combobox_id}: {result['error']}"
            )
        return self.read_combobox(combobox_id)

    def read_combobox(self, combobox_id: str) -> str:
        """
        The visible label of whatever a combobox currently holds.

        Reads `current_key` off the live control and resolves it against that
        control's own Entries, so what gets recorded is observed rather than
        assumed (CLAUDE.md rule 6). Returns `''` when the key resolves to
        nothing, which fails the caller's assertion — as it should.
        """
        result = self.controller.get_combobox_entries(combobox_id)
        current = str(result.get("current_key", ""))
        for entry in result.get("entries", []):
            if str(entry.get("key", "")) == current:
                return str(entry.get("value", ""))
        return ""

    # --------------------------------------------------------------- popups

    def popup(self) -> dict:
        return self.controller.get_popup_window()

    def read_check_run(self) -> CheckRun | None:
        """
        Read a check-run dialog's counters off its toolbar.

        The counters are read, not the message text: a dialog saying "Display
        messages" tells you nothing about severity, and the whole confirmation
        rule turns on terminations and errors both being zero.
        """
        popup = self.popup()
        if not popup.get("popup_exists"):
            return None
        counts = {"termination": 0, "error": 0, "warning": 0, "information": 0}
        for button in popup.get("buttons", []):
            tooltip = str(button.get("tooltip", "")).lower()
            text = str(button.get("text", "")).strip()
            if not text.isdigit():
                continue
            for key in counts:
                if key in tooltip:
                    counts[key] = int(text)
        return CheckRun(
            terminations=counts["termination"],
            errors=counts["error"],
            warnings=counts["warning"],
            information=counts["information"],
            messages=tuple(str(t) for t in popup.get("texts", []) if str(t).strip()),
        )

    def confirm_check_run(self, where: str) -> CheckRun | None:
        """
        Confirm a check-run dialog, but only at 0 terminations and 0 errors.

        Anything else is cancelled and raises. TC-014 hit this for real: a retry
        after a COM drop produced a 2-error check-run ("Error during
        distribution", "... is being processed") which was the *previous*,
        crashed attempt still settling server-side. Forcing that through would
        have written on top of an in-flight write.
        """
        check = self.read_check_run()
        if check is None:
            return None

        warnings = [m for m in check.messages if m and len(m) > 12]
        if not check.clean:
            self.controller.handle_popup(action="cancel")
            self.journal.check(f"{where} check run: 0 terminations, 0 errors",
                               "0 / 0", str(check), "fail")
            raise WriteRefused(
                f"{where}: check run reported {check} — cancelled, nothing committed. "
                f"Messages: {'; '.join(warnings) or '(none read)'}"
            )

        self.controller.handle_popup(action="confirm")
        self.journal.check(f"{where} check run: 0 terminations, 0 errors",
                           "0 / 0", str(check), "pass")
        for message in warnings:
            if "cannot be used" in message.lower():
                # Recorded, not suppressed — same as the web lane.
                self.journal.meta(f"{where} warning", message)
        return check

    # ---------------------------------------------------------------- write

    def write_guarded(self, where: str, do_write: Callable[[], Any],
                      verify_landed: Callable[[], bool],
                      retries: int = 2) -> Any:
        """
        Perform a database write, surviving a COM disconnect without guessing.

        This exists because of one specific incident (TC-014, 2026-08-19, deal
        160275): the COM connection dropped in the instant after Save was sent.
        The call raised a *transport* error, so nothing about it said whether
        SAP had committed. Retrying blind risks a duplicate write; giving up
        risks reporting a failure that actually succeeded.

        The rule this encodes is the one that worked by hand: **reconnect, then
        ask a read-only screen what actually happened, before deciding whether
        to retry.** `verify_landed` is that read-only question (for the FTR
        family, FTR_EDIT's History screen) and is mandatory — a write with no
        way to check itself does not get an automatic retry.

        A stale enqueue lock ("You are already editing transaction ...") left by
        the crashed attempt's own session is expected here and is retried rather
        than failed: in TC-014 it cleared on the very next attempt.
        """
        attempt = 0
        while True:
            attempt += 1
            try:
                return do_write()
            except Exception as exc:
                if isinstance(exc, (WriteRefused, SystemMismatch)):
                    raise

                lock_conflict = "already editing" in f"{exc}".lower()
                dropped = _is_com_drop(exc)
                if not (lock_conflict or dropped):
                    raise

                if attempt > retries:
                    raise ComDisconnected(
                        f"{where}: gave up after {attempt} attempts. Last error: {exc}"
                    ) from exc

                if dropped:
                    self.journal.deviation(
                        f"{where}: the COM connection dropped mid-write "
                        f"({exc}). Reconnected and verified against SAP before retrying — "
                        f"the write's outcome was not assumed."
                    )
                    self.reattach()
                    self.assert_dev_system(f"{where} (after COM reconnect)")
                else:
                    self.journal.deviation(
                        f"{where}: SAP reported the object was already being edited — "
                        f"consistent with a stale lock from an interrupted attempt. Retried."
                    )

                # The read-only question. If the write DID land, retrying would
                # duplicate it, so stop and report success instead.
                time.sleep(2)
                try:
                    landed = verify_landed()
                except Exception as verify_error:
                    if dropped:
                        raise ComDisconnected(
                            f"{where}: connection dropped AND the read-only verification "
                            f"could not run ({verify_error}). Refusing to retry blind — "
                            f"a human must check SAP directly before this case runs again."
                        ) from verify_error
                    raise WriteRefused(
                        f"{where}: SAP reported a lock conflict (not a COM drop), and the "
                        f"read-only verification that follows it could not run "
                        f"({verify_error}). Refusing to retry blind — a human must check "
                        f"SAP directly before this case runs again."
                    ) from verify_error

                if landed:
                    self.journal.step(
                        f"{where} — recovered after a COM drop; SAP confirms the write landed",
                        "ok", "not retried, to avoid a duplicate write",
                    )
                    return None
                self.journal.step(
                    f"{where} — COM drop, SAP confirms the write did NOT land; retrying",
                    "ok", f"attempt {attempt + 1}",
                )

    # ------------------------------------------------------------- evidence

    def capture(self, name: str, shows: str) -> Path | None:
        """
        Save a screenshot to `evidence/<system>/` and record it.

        The MCP tool (`sap_screenshot`) returns an inline image and never offers
        a path, which is why TC-014 saved no evidence files. The underlying
        controller has always accepted one — a script gets per-write screenshots
        for free, matching the web lane's convention.
        """
        try:
            self.evidence_dir.mkdir(parents=True, exist_ok=True)
            path = self.evidence_dir / f"{name}.png"
            result = self.controller.take_screenshot(str(path))
            if not result.get("filepath"):
                return None
            self.journal.evidence(
                str(path.relative_to(REPO_ROOT)).replace("\\", "/"), shows,
            )
            return path
        except Exception:
            return None  # evidence is worth less than the run

    # --------------------------------------------------------------- tables

    def read_table(self, table_id: str, max_rows: int = 100) -> dict:
        return self.controller.read_table(table_id, max_rows=max_rows)

    def drill_into_row(self, table_id: str, row: int, column: str) -> dict:
        """
        Open a grid row's detail.

        Select first, then double-click. TC-014 found TBB1's "Information
        Overview" grid ignores a double-click on a row that is not already
        selected — the first attempt silently did nothing and only the second,
        after `select_table_row`, drilled in. The web lane never meets this
        control, so this sequence is GUI-lane-specific.
        """
        self.controller.select_table_row(table_id, row)
        return self.controller.double_click_table_cell(table_id, row, column)

    def screen_labels(self) -> list[str]:
        """
        Every label on the current screen, for reading list-style output.

        **The MCP tool's JSON is not the library's return type.** `sap_get_screen_elements`
        answers `{"element_count": n, "elements": [...]}`, but the method underneath
        returns a bare `List[ScreenElement]` — dataclass instances with `.text`,
        not dicts with `["text"]`. Writing this against the tool's shape is what
        crashed the first scripted TC-014 run with
        `AttributeError: 'list' object has no attribute 'get'`, after two live
        writes had already committed.

        `get_screen_elements` is the only method used here with that mismatch;
        every other one returns a dict, and `get_session_info` /
        `connect_to_existing_session` return a `SessionInfo` dataclass that this
        module reads by attribute.
        """
        try:
            elements = self.controller.get_screen_elements(
                container_id="wnd[0]/usr", type_filter="GuiLabel", max_depth=3,
            )
        except Exception:
            return []
        labels: list[str] = []
        for element in elements or []:
            # Tolerate either shape: a dataclass today, a dict if the vendored
            # library ever normalises its return value.
            text = getattr(element, "text", None)
            if text is None and isinstance(element, dict):
                text = element.get("text")
            text = str(text or "").strip()
            if text:
                labels.append(text)
        return labels


def _same_value(observed: str, sent: Any) -> bool:
    """
    Did a field take the value we sent?

    Compared loosely because SAP reformats on entry: `100000` reads back as
    `100,000.00`, `10` as `10.0000000`. Digits are compared, with trailing
    zeros after a decimal point ignored; everything else is compared as text.
    """
    obs = str(observed).strip()
    want = str(sent).strip()
    if obs == want:
        return True
    if not obs:
        return False

    def digits(text: str) -> str:
        cleaned = "".join(ch for ch in text if ch.isdigit() or ch in ".,-")
        cleaned = cleaned.replace(",", "")
        if "." in cleaned:
            cleaned = cleaned.rstrip("0").rstrip(".")
        return cleaned

    return bool(digits(obs)) and digits(obs) == digits(want)
