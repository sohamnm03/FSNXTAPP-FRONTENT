"""Run a validated external case plan without a model or arbitrary sidecar code."""
from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path


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

    def read(step):
        if step["source"] == "status":
            screen = check_result(sap.screen())
            return str(screen.get("message") or "")
        if step["source"] == "popup":
            return json.dumps(check_result(sap.popup()), default=str)
        if step["source"] == "checked":
            value = sap.read_checkbox(step["target"])
            if value is None:
                raise RuntimeError("Checkbox state could not be read")
            return str(value).lower()
        result = check_result(sap.controller.read_field(step["target"]))
        if "value" not in result:
            raise RuntimeError("Field value could not be read")
        return str(result["value"])

    def assertion(expected, actual, label, match="equals"):
        ok = expected in actual if match == "contains" else actual == expected
        observed["assertions"].append(dict(expected=f"{label}: {expected}", observed=actual, result="pass" if ok else "fail"))
        flush()
        if not ok:
            raise AssertionError(f"{label}: expected {expected!r}, observed {actual!r}")

    flush()
    try:
        info = sap.assert_dev_system("external case start")
        observed["systemConfirmed"] = True
        observed["session"] = f"{info['system']}/{info['client']} user={info['user']}"
        for step in plan["steps"]:
            sap.assert_dev_system(step["label"])
            action, target = step["action"], step.get("target", "")
            value = substitute(step.get("value"), variables)
            entry = dict(step=step["label"], outcome="error", detail="Started; completion not yet verified")
            observed["steps"].append(entry)
            if step.get("write"):
                writes += 1
                observed["writesVerified"] = False
            flush()
            if action == "transaction":
                check_result(sap.start_transaction(value))
            elif action == "fill":
                check_result(sap.controller.set_field(target, value))
                assertion(value, read(dict(source="field", target=target)), step["label"])
            elif action == "press":
                check_result(sap.press(target))
            elif action == "key":
                check_result(sap.send(int(value)))
            elif action == "tab":
                check_result(sap.select_tab(target))
            elif action == "select":
                sap.select_combobox(target, value)
            elif action == "check":
                check_result(sap.controller.select_checkbox(target, value))
                assertion(str(value).lower(), read(dict(source="checked", target=target)), step["label"])
            elif action == "assert":
                actual = read(step)
                assertion(substitute(step["expected"], variables), actual, step["label"], step.get("match", "equals"))
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
    if not login["allowed_transactions"]:
        raise SystemExit("The selected system has no transaction allowlist")
    lock = RunLock(sid, plan["caseId"])
    lock.acquire()
    pythoncom.CoInitialize()
    try:
        journal = Journal(os.environ["FSNXT_RUN_ID"], sid, plan["caseId"])
        sap = GuiSession(journal, name, client, logon_description=login["logon_description"],
                         sap_user=login["user"], sap_password=login["password"],
                         language=login["language"], allowed_transactions=login["allowed_transactions"])
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
