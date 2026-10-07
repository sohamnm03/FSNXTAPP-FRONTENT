"""Run a validated external case plan without a model or arbitrary sidecar code."""
from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path


def _is_tab_target(target: str) -> bool:
    return bool(re.search(r"/tabp[^/]+$", str(target or ""), re.IGNORECASE))


def _status_observation(screen: dict) -> str:
    """Expose every stable status value a recorded assertion may have observed."""
    message_id = str(screen.get("message_id") or "").strip()
    message_number = str(screen.get("message_number") or "").strip()
    code = " ".join(value for value in (message_id, message_number) if value)
    location = " / ".join(str(screen.get(key) or "").strip()
                          for key in ("program", "screen_number")
                          if str(screen.get(key) or "").strip())
    values = [code, str(screen.get("message") or "").strip(), location,
              str(screen.get("title") or "").strip()]
    # Preserve order while avoiding noisy duplicates in run reports.
    return " | ".join(dict.fromkeys(value for value in values if value))


def _status_title_matches(expected: str, actual: str) -> bool:
    """Match an authored section title against SAP GUI's stable base title.

    Some authoring tools describe the selected tab as part of the title, for
    example ``Create Interest Rate Instrument: Structure``. SAP GUI scripting
    exposes only ``Create Interest Rate Instrument:`` on the same screen. Keep
    this fallback limited to that exact base-title relationship.
    """
    title = str(actual or "").rsplit(" | ", 1)[-1].strip()
    expected = str(expected or "").strip()
    suffix = expected[len(title):].strip() if expected.startswith(title) else ""
    return bool(title.endswith(":") and suffix)


def _comparable(value) -> str:
    """Text as SAP means it: no outer padding, internal whitespace runs as one."""
    return " ".join(str(value or "").split())


def _same_number(observed: str, expected: str,
                 require_display_format: bool = False) -> bool:
    """Compare numeric values without confusing identifiers with amounts.

    SAP may turn ``1000000`` into ``1,000,000.00`` or move a minus sign to
    the end. Existing plans do not carry a numeric marker, so their fallback
    is enabled only when one side visibly has numeric display formatting.
    New plans can opt in explicitly for known amount/rate/quantity fields.
    """
    observed = _comparable(observed)
    expected = _comparable(expected)
    if require_display_format and not any(
            "," in value or "." in value or value.endswith("-")
            or value.startswith("+") for value in (observed, expected)):
        return False

    number = r"(?:[+-]?[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?-)"
    if not re.fullmatch(number, observed) or not re.fullmatch(number, expected):
        return False

    def canonical(text: str) -> str:
        negative = text.startswith("-") or text.endswith("-")
        digits = text.lstrip("+-").rstrip("-").replace(",", "")
        if "." in digits:
            whole, fraction = digits.split(".", 1)
            fraction = fraction.rstrip("0")
        else:
            whole, fraction = digits, ""
        whole = whole.lstrip("0") or "0"
        value = f"{whole}.{fraction}" if fraction else whole
        return f"-{value}" if negative and value != "0" else value

    return canonical(observed) == canonical(expected)


def _short_control_id(control_id: str) -> str:
    return re.sub(r"^/app/con\[\d+\]/ses\[\d+\]/", "", str(control_id or ""))


def _technical_name(control_id: str) -> str:
    leaf = _short_control_id(control_id).rsplit("/", 1)[-1]
    return re.sub(r"^(?:ctxt|txt|cmb|chk|rad|btn|tabp)", "", leaf,
                  flags=re.IGNORECASE)


def _canonical_transaction(value: str) -> str:
    transaction = str(value or "").strip().upper().lstrip("=")
    while transaction.startswith(("/N", "/O", "/*")):
        transaction = transaction[2:].lstrip()
    return transaction


def _containing_tab(control_id: str) -> str:
    match = re.match(r"^(.*?/tabp[^/]+)(?:/|$)", _short_control_id(control_id),
                     re.IGNORECASE)
    return match.group(1) if match else ""


def _grid_observation(table: dict) -> str:
    """Render ALV cell data as readable text for saved ``contains`` checks."""
    rows = table.get("data")
    if not isinstance(rows, list):
        raise RuntimeError("ALV grid rows could not be read")
    rendered = []
    for row in rows:
        if not isinstance(row, dict):
            rendered.append(str(row))
            continue
        cells = []
        for column, value in row.items():
            if str(column).startswith("_") or value is None:
                continue
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False, default=str)
            cells.append(f"{column}={value}")
        rendered.append(" | ".join(cells))
    return "\n".join(rendered)


def substitute(value, variables):
    if not isinstance(value, str):
        return value
    return re.sub(r"\$\{([^}]+)\}", lambda match: variables[match[1]], value)


def execute(plan, sap, output: Path):
    """No action retries: a failed/uncertain write must never create another deal."""
    observed = dict(verdict="BLOCKED", systemConfirmed=False, writesVerified=False,
                    session="", summary="Started saved automation", assertions=[],
                    steps=[], documents=[], deviations=[], evidence=[])
    variables = {}
    writes = verified = 0

    def flush():
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(observed, indent=2), encoding="utf-8")

    def check_result(result):
        if isinstance(result, dict) and (result.get("error") or result.get("success") is False):
            raise RuntimeError(str(result.get("error") or result))
        return result

    def dismiss_express_information():
        """Dismiss SAP's non-interactive inbox notice without hiding its text.

        A fresh scripted login can receive an ``Express Information`` window
        that the authoring session already acknowledged. It has no inputs and
        only covers the actual transaction screen; leaving it open makes the
        next discovered ``wnd[0]`` control look missing. Do not generalise this
        to confirmations or arbitrary popups: those remain explicit plan steps.
        """
        popup_reader = getattr(sap, "popup", None)
        if not callable(popup_reader):
            return False
        popup = check_result(popup_reader())
        if (not popup.get("popup_exists")
                or str(popup.get("title") or "").strip() != "Express Information"
                or popup.get("has_inputs") is True):
            return False
        button = next((item for item in popup.get("buttons", [])
                       if str(item.get("tooltip") or item.get("text") or "")
                       .strip().lower().startswith("continue")), None)
        if not button or not button.get("id"):
            return False
        check_result(sap.press(_short_control_id(button["id"])))
        detail = " | ".join(str(text).strip() for text in popup.get("texts", [])
                            if str(text).strip())
        observed["steps"].append(dict(
            step="Dismiss Express Information",
            outcome="ok",
            detail=f"Acknowledged non-interactive SAP notice: {detail or 'no text exposed'}",
        ))
        flush()
        return True

    def discover_target(target):
        """Resolve a drifted container path by one unique SAP technical name."""
        try:
            elements = sap.controller.get_screen_elements(
                container_id="wnd[0]/usr", max_depth=12)
        except Exception:
            return ""
        leaf = _short_control_id(target).rsplit("/", 1)[-1].lower()
        name = _technical_name(target).lower()
        leaf_matches = []
        name_matches = []
        for element in elements:
            element_id = _short_control_id(getattr(element, "id", ""))
            element_leaf = element_id.rsplit("/", 1)[-1].lower()
            element_name = str(getattr(element, "name", "") or "").lower()
            if element_leaf == leaf:
                leaf_matches.append(element_id)
            if name and element_name == name:
                name_matches.append(element_id)
        matches = list(dict.fromkeys(leaf_matches or name_matches))
        return matches[0] if len(matches) == 1 else ""

    def target_call(target, operation, label):
        """Use the recorded id first, then one unambiguous live equivalent."""
        result = operation(target)
        failed = isinstance(result, dict) and (result.get("error") or result.get("success") is False)
        resolved = ""
        if failed and str(target or "").startswith("wnd[0]/") and dismiss_express_information():
            result = operation(target)
            failed = isinstance(result, dict) and (result.get("error") or result.get("success") is False)
        tab = _containing_tab(target)
        if failed and tab and tab != _short_control_id(target):
            tab_result = sap.select_tab(tab)
            tab_failed = (isinstance(tab_result, dict)
                          and (tab_result.get("error")
                               or tab_result.get("success") is False))
            if not tab_failed:
                result = operation(target)
                failed = (isinstance(result, dict)
                          and (result.get("error")
                               or result.get("success") is False))
        if failed:
            resolved = discover_target(target)
            if resolved:
                result = operation(resolved)
                failed = isinstance(result, dict) and (result.get("error") or result.get("success") is False)
        if failed:
            screen = sap.screen()
            location = f"{screen.get('program') or '?'} / {screen.get('screen_number') or '?'}"
            title = str(screen.get("title") or "").strip() or "untitled screen"
            message = str(screen.get("message") or "").strip()
            detail = f" Status: {message}" if message else ""
            raise RuntimeError(
                f"{label}: SAP control {_technical_name(target)!r} was not present on "
                f"{location} ({title}).{detail}"
            )
        return result, resolved or target

    def target_available(target):
        if discover_target(target):
            return True
        tab = _containing_tab(target)
        if not tab or tab == _short_control_id(target):
            return False
        if not discover_target(tab):
            return False
        result = sap.select_tab(tab)
        failed = (isinstance(result, dict)
                  and (result.get("error") or result.get("success") is False))
        return not failed and bool(discover_target(target))

    def read(step):
        if step["source"] == "status":
            screen = check_result(sap.screen())
            return _status_observation(screen)
        if step["source"] == "popup":
            return json.dumps(check_result(sap.popup()), default=str)
        if step["source"] == "checked":
            value = sap.read_checkbox(step["target"])
            if value is None:
                raise RuntimeError("Checkbox state could not be read")
            return str(value).lower()
        result, resolved_target = target_call(
            step["target"], sap.controller.read_field,
            step.get("label", "Read field"))
        result = check_result(result)
        if "value" not in result:
            raise RuntimeError("Field value could not be read")
        value = str(result["value"])
        element_type = str(result.get("type") or "")
        is_grid = ("gridview" in element_type.lower()
                   or re.fullmatch(r"SAPGUI\.GridViewCtrl(?:\.\d+)?",
                                   value.strip(), re.IGNORECASE))
        if step["source"] == "text" and is_grid:
            return _grid_observation(check_result(
                sap.read_table(resolved_target, max_rows=100)))
        return value

    def assertion(expected, actual, label, match="equals", source="",
                  fallback_target="", number_mode="strict"):
        # SAP pads values for display, and how much depends on the field's
        # length and whether the screen has been processed yet, so the same
        # plan can read "150,000,000.00" one run and " 150,000,000.00" the
        # next. Compare whitespace-normalized text for every source; keep
        # punctuation, sign, decimals and the original observed value intact
        # for the run report.
        comparable_expected = _comparable(expected)
        comparable_actual = _comparable(actual)
        ok = (comparable_expected in comparable_actual
              if match == "contains"
              else comparable_actual == comparable_expected)
        if not ok and match == "equals" and number_mode != "strict":
            ok = _same_number(
                comparable_actual,
                comparable_expected,
                require_display_format=number_mode == "formatted",
            )
        if not ok and source == "status" and match == "equals":
            # The status observation joins code, message, program/screen and
            # title; an authored "equals" names exactly one of those values.
            ok = expected.strip() in (part.strip() for part in actual.split(" | "))
        if not ok and source == "status":
            # A base title alone cannot prove which tab/subscreen is active.
            # Require the next recorded control to exist before accepting an
            # older section-qualified title such as "...: Structure".
            ok = (_status_title_matches(expected, actual)
                  and bool(fallback_target)
                  and target_available(fallback_target))
        observed["assertions"].append(dict(expected=f"{label}: {expected}", observed=actual, result="pass" if ok else "fail"))
        flush()
        if not ok:
            raise AssertionError(f"{label}: expected {expected!r}, observed {actual!r}")

    flush()
    try:
        info = sap.assert_dev_system("external case start")
        observed["systemConfirmed"] = True
        observed["session"] = f"{info['system']}/{info['client']} user={info['user']}"
        for index, step in enumerate(plan["steps"]):
            sap.assert_dev_system(step["label"])
            action, target = step["action"], step.get("target", "")
            expects_popup = (action == "assert" and step.get("source") == "popup") \
                or bool(re.match(r"^wnd\[[1-9]\]/", str(target or "")))
            if not expects_popup:
                dismiss_express_information()
            value = substitute(step.get("value"), variables)
            entry = dict(step=step["label"], outcome="error", detail="Started; completion not yet verified")
            observed["steps"].append(entry)
            if step.get("write"):
                writes += 1
                observed["writesVerified"] = False
            flush()
            if action == "transaction":
                check_result(sap.start_transaction(value))
                next_step = plan["steps"][index + 1] if index + 1 < len(plan["steps"]) else {}
                next_expects_popup = (next_step.get("action") == "assert"
                                      and next_step.get("source") == "popup") \
                    or bool(re.match(r"^wnd\[[1-9]\]/",
                                     str(next_step.get("target") or "")))
                if not next_expects_popup:
                    dismissed_notice = dismiss_express_information()
                    current = check_result(sap.screen())
                    actual_transaction = _canonical_transaction(current.get("transaction"))
                    if (dismissed_notice and actual_transaction
                            and actual_transaction != _canonical_transaction(value)):
                        # The modal notice can interrupt StartTransaction before
                        # SAP consumes it. Navigation is read-only, so retry it
                        # once after acknowledging the notice; writes are never
                        # retried anywhere in this runner.
                        check_result(sap.start_transaction(value))
                        dismiss_express_information()
                        current = check_result(sap.screen())
                        actual_transaction = _canonical_transaction(current.get("transaction"))
                    if actual_transaction and actual_transaction != _canonical_transaction(value):
                        raise RuntimeError(
                            f"{step['label']}: expected transaction "
                            f"{_canonical_transaction(value)}, observed {actual_transaction}"
                        )
            elif action == "fill":
                result, target = target_call(
                    target, lambda candidate: sap.controller.set_field(candidate, value),
                    step["label"])
                check_result(result)
                # A fill sends raw input ("150000000"); SAP may already show it
                # formatted ("150,000,000.00"), so accept the same number. The
                # visible-format requirement keeps numeric identifiers strict.
                assertion(value, read(dict(source="field", target=target,
                                           label=step["label"])), step["label"],
                          source="field", number_mode="formatted")
            elif action == "press":
                # Compatibility for sidecars published before tab actions were
                # normalized: GuiTab exposes select(), never press().
                if _is_tab_target(target):
                    result, target = target_call(target, sap.select_tab, step["label"])
                    check_result(result)
                else:
                    result, target = target_call(target, sap.press, step["label"])
                    check_result(result)
            elif action == "key":
                check_result(sap.send(int(value)))
            elif action == "tab":
                result, target = target_call(target, sap.select_tab, step["label"])
                check_result(result)
            elif action == "select":
                # LTFS plans created by the first sidecar release used select
                # for both combo boxes and tabs. Keep those signed sidecars
                # runnable while new plans are normalized to action="tab".
                if _is_tab_target(target):
                    result, target = target_call(target, sap.select_tab, step["label"])
                    check_result(result)
                else:
                    result, target = target_call(
                        target, lambda candidate: sap.select_combobox(candidate, value),
                        step["label"])
                    check_result(result)
            elif action == "check":
                check_result(sap.controller.select_checkbox(target, value))
                assertion(str(value).lower(), read(dict(source="checked", target=target)), step["label"])
            elif action == "assert":
                actual = read(step)
                numeric_source = step.get("source") in ("field", "value")
                number_mode = ("numeric" if step.get("numeric") is True
                               else "formatted" if numeric_source
                               else "strict")
                fallback_target = next(
                    (later.get("target", "") for later in plan["steps"][index + 1:]
                     if later.get("target")), "")
                assertion(substitute(step["expected"], variables), actual, step["label"],
                          step.get("match", "equals"), step.get("source", ""),
                          fallback_target, number_mode)
                if step.get("capture"):
                    match = re.search(step["pattern"], actual)
                    if not match or not match.lastindex or not match.group(1):
                        raise AssertionError("The current SAP document/value could not be captured")
                    variables[step["capture"]] = match.group(1)
                    if step.get("documentType"):
                        observed["documents"].append(dict(type=step["documentType"], number=match.group(1), leftInPlace=True))
                if step.get("verifiesWrite"):
                    verified += 1
            else:
                raise ValueError(f"Unsupported action: {action}")
            entry.update(outcome="ok", detail="Executed and checked")
            flush()
        if not observed["assertions"] or writes != verified:
            raise AssertionError("Missing assertions or unverified database writes")
        observed.update(verdict="PASS", writesVerified=True, summary="Saved automation completed; all recorded assertions passed.")
    except Exception as error:
        observed.update(verdict="FAIL", summary=str(error))
        observed["deviations"].append(str(error))
    finally:
        flush()
    return observed


def main(plan=None):
    if os.environ.get("FSNXT_AUTOMATION_APPROVED") != "1":
        raise SystemExit("Select the Markdown case and confirm its writes in FSNXT before running.")
    plan = plan or json.loads(Path(os.environ["FSNXT_AUTOMATION_PLAN"]).read_text(encoding="utf-8"))
    if plan["systemId"] != os.environ.get("SAP_SYSTEM_ID") or plan["lane"] != "gui":
        raise SystemExit("Automation system/lane mismatch")
    # Lazy imports let the interpreter and failure reporting be tested without SAP.
    from .run import resolve_system, RunLock
    from .journal import Journal
    from .session import GuiSession
    import pythoncom

    sid, name, client, login = resolve_system(plan["systemId"])
    if not login["blocked_transactions"] and not login["allowed_transactions"]:
        raise SystemExit("The selected system has no transaction policy")
    lock = RunLock(sid, plan["caseId"])
    lock.acquire()
    pythoncom.CoInitialize()
    try:
        journal = Journal(os.environ["FSNXT_RUN_ID"], sid, plan["caseId"])
        sap = GuiSession(journal, name, client, logon_description=login["logon_description"],
                         sap_user=login["user"], sap_password=login["password"],
                         language=login["language"],
                         allowed_transactions=login["allowed_transactions"],
                         blocked_transactions=login["blocked_transactions"])
        sap.login()
        info = sap.assert_dev_system("login")
        if info["user"].upper() != str(login["user"]).upper():
            raise RuntimeError("Logged-on SAP user differs from the approved credentials")
        result = execute(plan, sap, Path(os.environ["FSNXT_EXTERNAL_RUN_DIR"]) / "observations.json")
        print(result["summary"])
        return 0 if result["verdict"] == "PASS" else 1
    finally:
        # Keep the session visible for inspection; never log off another session.
        pythoncom.CoUninitialize()
        lock.release()


def run_encoded(encoded):
    raise SystemExit(main(json.loads(base64.b64decode(encoded))["plan"]))


if __name__ == "__main__":
    raise SystemExit(main())
