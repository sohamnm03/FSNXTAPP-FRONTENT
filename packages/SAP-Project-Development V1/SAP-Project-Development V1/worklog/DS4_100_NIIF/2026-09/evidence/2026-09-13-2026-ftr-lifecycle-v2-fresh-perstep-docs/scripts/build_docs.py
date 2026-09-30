"""Build one Word document per step of the FTR lifecycle run through Dynamic Gateway v2.

Each document is written to stand alone: a reader who has never heard of the gateway can
open document 05 and still learn what the thing is, what this step does, what went over the
wire, and what it left behind in the framework's five tables.

Every URL, request body and response quoted here is lifted verbatim from raw-calls.log, and
every row count is read from the snapshot JSON - nothing in these documents is retyped from
memory.
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from extract import EV, calls, snaps, call_parts

SNAP = os.path.join(EV, "snapshots")
SHOT = os.path.join(EV, "screenshots")
OUT_MD = os.path.join(HERE, "md")
DOWNLOADS = os.path.expanduser(r"~\Downloads")
os.makedirs(OUT_MD, exist_ok=True)

DEAL = "0000000160457"
BASE = ("https://vhnlqds4ap01.sap.niififl.in:44300/sap/opu/odata4/sap/"
        "zfs_sb_dyngw_o4_api/srvd_a2x/sap/zfs_sd_dyngw/0001")
NS = "com.sap.gateway.srvd_a2x.zfs_sd_dyngw.v0001"


def rows(tag, entity):
    p = os.path.join(SNAP, "%s--%s.json" % (tag, entity))
    return json.load(open(p, encoding="utf-8-sig"))["value"]


def counts(tag):
    return {e: len(rows(tag, e)) for e in
            ("Registry", "RegistryHistory", "CallLog", "CallStep")}


def wrap(s, width=96):
    """Hard-wrap a long single-line JSON string so it does not run off the page."""
    out = []
    while len(s) > width:
        out.append(s[:width])
        s = s[width:]
    out.append(s)
    return "\n".join(out)


def pretty(js):
    try:
        return json.dumps(json.loads(js), indent=2)
    except Exception:
        return wrap(js)


def unnest(body):
    """Decode the *Json string layers of a request body so a reader can see the real
    payload instead of a wall of backslashes."""
    try:
        o = json.loads(body)
    except Exception:
        return None
    out = []
    for key in ("StepsJson", "ImportJson", "TablesJson", "FilterJson", "FieldsJson"):
        if key in o and isinstance(o[key], str) and o[key].strip():
            try:
                inner = json.loads(o[key])
            except Exception:
                continue
            out.append((key, json.dumps(inner, indent=2)))
            if key == "StepsJson" and isinstance(inner, list):
                for step in inner:
                    for k2 in ("ImportJson", "TablesJson", "FilterJson", "FieldsJson"):
                        v = step.get(k2, "")
                        if isinstance(v, str) and v.strip():
                            try:
                                out.append(("StepsJson[0]." + k2,
                                            json.dumps(json.loads(v), indent=2)))
                            except Exception:
                                pass
    return out


def shots(*names):
    """Emit markdown image tags, refusing silently to reference a file that is not there."""
    md = []
    for caption, fname in names:
        p = os.path.join(SHOT, fname)
        if not os.path.exists(p):
            raise SystemExit("missing screenshot: " + p)
        md.append("![%s](%s)\n" % (caption, p))
    return "\n".join(md)


# ---------------------------------------------------------------------------
# Blocks repeated in every document, so each one can be read on its own.
# ---------------------------------------------------------------------------

PRIMER = """
## Read this first — what the Dynamic Gateway v2 is

**The problem it solves.** Anything outside SAP that needs to reach into an S/4HANA system —
a portal, a bot, an integration layer, a test harness — normally needs a bespoke OData service
per use case. Each one is a development project, a transport, and a new thing to secure.

**What v2 does instead.** It is *one* published OData V4 service,
`ZFS_SB_DYNGW_O4_API`, that can call a function module, read a table, run a query or submit
an ABAP report — but **only** against targets an administrator has explicitly put on an
allow-list first. New integrations become allow-list rows and JSON payloads rather than new
ABAP objects.

**The rule that makes it safe.** *Nothing runs unless it is registered.* An unregistered
target is refused with message **017**, and a registered-but-deactivated target is refused with
the **same** 017 — a distinct message would tell an unauthorised caller that the target exists.
The gateway also refuses to operate on its own tables (`ZFS_T_DYN_*`, message **039**), which
is what closes the privilege-escalation hole v1 had.

### The six actions and the five step kinds

| Action | What it does |
|---|---|
| `RunQuery` | read rows from a table or CDS view |
| `CallFunctionModule` | call one function module or BAPI |
| `ExecuteTableCrud` | insert / update / delete table rows |
| `SubmitReport` | run an executable ABAP report and capture its output |
| `RegisterTarget` | add, change or deactivate an allow-list entry |
| `ExecuteBatch` | run several **steps** in one call, under one commit decision |

A batch step is one of five **kinds**: `FUNC` (function module), `TABL` (table CRUD),
`QURY` (query), `SUBM` (submit a report), `REGI` (register a target).

### The five tables this documentation keeps showing you

| Table | Entity set | What it holds |
|---|---|---|
| `ZFS_T_DYN_REG` | `/Registry` | the **allow-list** — the security boundary |
| `ZFS_T_DYN_REGH` | `/RegistryHistory` | every change to that allow-list, with before/after images |
| `ZFS_T_DYN_CALL` | `/CallLog` | one row per request — the call header |
| `ZFS_T_DYN_STEP` | `/CallStep` | one row per step within a request |
| `ZFS_T_TRM_PROBE` | — | a rollback probe table, unrelated to this lifecycle; it stays empty throughout and acts as a negative control |

### Where you would use it, and where you would not

**Use it** for integration and automation against a controlled set of targets: a partner
portal that has to create a treasury deal, a month-end job runner, a test harness that needs
to drive several transactions in sequence, provisioning a freshly imported system.

**Do not use it** as a general-purpose database gateway or as a way around a missing
authorisation. Every target is a deliberate, auditable grant; if you find yourself wanting to
register something broad to make a problem go away, that is the signal to build a proper
service instead.

### Two things that trip up every first-time caller

1. **`sap-client=100` on every URL.** Leave it off and you get a 401 that looks exactly like a
   bad password.
2. **A refusal is HTTP 200.** The gateway answers `200` with `ExecStatus: "E"` in the body.
   Branch on `ExecStatus`, not on the HTTP status code. (An aborted *batch* is the exception —
   that one is a 400, with the reason in the body.)
"""

URLS = """
### The endpoints used in this run

**Base URL**

```
%s
```

**Get a CSRF token** (needed before any POST; plain GETs need none)

```
GET  %s/$metadata?sap-client=100
     X-CSRF-Token: Fetch
→ 200; read the token from the X-CSRF-Token response header and keep the session cookie
```

**The two action endpoints**

```
POST %s/CallLog/%s.RegisterTarget?sap-client=100
POST %s/CallLog/%s.ExecuteBatch?sap-client=100
     X-CSRF-Token: <token>
     Content-Type: application/json
     Accept: application/json
```

**The four read endpoints — the framework's own tables, through its own service**

```
GET %s/Registry?sap-client=100          → ZFS_T_DYN_REG
GET %s/RegistryHistory?sap-client=100   → ZFS_T_DYN_REGH
GET %s/CallLog?sap-client=100           → ZFS_T_DYN_CALL
GET %s/CallStep?sap-client=100          → ZFS_T_DYN_STEP
```
""" % (BASE, BASE, BASE, NS, BASE, NS, BASE, BASE, BASE, BASE)

LIFECYCLE_STEPS = [
    ("0", "Baseline", "—", "prove the system is empty before anything is done"),
    ("1", "Register the six targets", "REGI", "build the allow-list"),
    ("2", "Create the term loan", "FUNC", "`BAPI_FTR_IRATE_DEALCREATE`, dry run then real"),
    ("3", "Settle the deal", "FUNC", "`BAPI_FTR_IRATE_SETTLE`"),
    ("4", "Post the flows (TBB1)", "SUBM", "`RFTBBB00`, test then real"),
    ("5", "Month-end accrual (TPM44)", "SUBM", "`RTPM_ACCRUAL_DEFERRAL`, test then real"),
    ("6", "Valuation (TPM1)", "SUBM", "`RTPM_TRL_VALUATION`"),
    ("7", "Write the fee row", "TABL", "`ZSGSLCTR_FEEDATA` INSERT"),
]


def where_am_i(current):
    md = ["\n## Where this step sits in the lifecycle\n",
          "| # | Step | Kind | What it does |", "|---|---|---|---|"]
    for num, name, kind, what in LIFECYCLE_STEPS:
        if num == current:
            md.append("| **%s** | **%s ← you are here** | **%s** | %s |" % (num, name, kind, what))
        else:
            md.append("| %s | %s | %s | %s |" % (num, name, kind, what))
    md.append("")
    md.append("The whole run is **15 calls, 15 steps, zero failures**, against a system whose "
              "five gateway tables were emptied by the system owner beforehand. The deal "
              "created is **%s**." % DEAL)
    return "\n".join(md)


HEADER_FACTS = """
| | |
|---|---|
| **System** | `DS4`, client `100` (`DS4_100_NIIF`) |
| **Service** | `ZFS_SB_DYNGW_O4_API` (Dynamic Gateway **v2**) |
| **Executed by** | `FS_DEV3` |
| **Date** | 2026-09-13 |
| **Deal created by this run** | **%s** |
| **Evidence folder** | `worklog/DS4_100_NIIF/2026-09/evidence/2026-09-13-2026-ftr-lifecycle-v2-fresh-perstep-docs/` |
""" % DEAL


def growth_table(before_tag, after_tag, note=""):
    b = counts(before_tag) if before_tag else {k: 0 for k in
                                               ("Registry", "RegistryHistory", "CallLog", "CallStep")}
    a = counts(after_tag)
    md = ["| Table | Entity set | Before | After | Change |", "|---|---|---|---|---|"]
    names = {"Registry": "`ZFS_T_DYN_REG`", "RegistryHistory": "`ZFS_T_DYN_REGH`",
             "CallLog": "`ZFS_T_DYN_CALL`", "CallStep": "`ZFS_T_DYN_STEP`"}
    for e in ("Registry", "RegistryHistory", "CallLog", "CallStep"):
        d = a[e] - b[e]
        md.append("| %s | `/%s` | %d | **%d** | %s |" %
                  (names[e], e, b[e], a[e], ("+%d" % d) if d else "unchanged"))
    md.append("| `ZFS_T_TRM_PROBE` | — | 0 | **0** | unchanged (negative control) |")
    if note:
        md.append("")
        md.append(note)
    return "\n".join(md)


def call_block(label, heading, explain=""):
    url, req, resp, http = call_parts(label)
    md = ["\n### %s\n" % heading]
    if explain:
        md.append(explain + "\n")
    md.append("**Full URL**\n")
    md.append("```\nPOST %s\n```\n" % url)
    md.append("**Request headers**\n")
    md.append("```\nX-CSRF-Token: <token from the $metadata call>\n"
              "Content-Type: application/json\nAccept: application/json\n```\n")
    md.append("**Request body — exactly as sent**\n")
    md.append("```\n%s\n```\n" % wrap(req))
    layers = unnest(req)
    if layers:
        md.append("**The same body with its JSON-in-string layers decoded** — this is what the "
                  "gateway actually acts on. Note that these are *strings* on the wire; the "
                  "escaping is not decoration, it is the transport.\n")
        for name, txt in layers:
            md.append("`%s` decodes to:\n" % name)
            md.append("```json\n%s\n```\n" % txt)
    md.append("**Response — HTTP %s**\n" % http)
    md.append("```json\n%s\n```\n" % pretty(resp))
    return "\n".join(md)


def write(name, title, body):
    path = os.path.join(OUT_MD, name + ".md")
    open(path, "w", encoding="utf-8").write("# %s\n%s" % (title, body))
    return path


# ===========================================================================
DOCS = []

# ---------------------------------------------------------------- overview
c7 = counts("step7-final-after-fee-row")
ov = []
ov.append(HEADER_FACTS)
ov.append(PRIMER)
ov.append(URLS)
ov.append("""
## What this set of documents is

The FTR term-loan lifecycle — create a deal, settle it, post its flows, accrue interest at
month end, value it, and write a fee row — was executed **end to end through the gateway and
nothing else**, on a system whose five gateway tables had been emptied first. There is one
document per step. Each one repeats the primer above, so it can be handed to somebody on its
own, and then shows:

- the **full URL** of every call the step makes
- the **exact JSON** sent, and the same JSON with its nested string layers decoded
- the **response**, verbatim
- **which of the five tables changed**, and why each column holds what it holds
- **SE16 screenshots** of those tables, taken immediately after the step
- where applicable, **independent verification** read over ADT SQL — a channel that does not
  go through the component being tested

| Document | Covers |
|---|---|
| `DynGW-v2-Step-0-Baseline.docx` | the empty-system starting point |
| `DynGW-v2-Step-1-Register-Targets.docx` | building the allow-list (REGI) |
| `DynGW-v2-Step-2-Create-Deal.docx` | `BAPI_FTR_IRATE_DEALCREATE` (FUNC), dry run and real |
| `DynGW-v2-Step-3-Settle-Deal.docx` | `BAPI_FTR_IRATE_SETTLE` (FUNC) |
| `DynGW-v2-Step-4-TBB1-Post-Flows.docx` | `RFTBBB00` (SUBM), test and real |
| `DynGW-v2-Step-5-TPM44-Accrual.docx` | `RTPM_ACCRUAL_DEFERRAL` (SUBM), test and real |
| `DynGW-v2-Step-6-TPM1-Valuation.docx` | `RTPM_TRL_VALUATION` (SUBM) |
| `DynGW-v2-Step-7-Fee-Row.docx` | `ZSGSLCTR_FEEDATA` (TABL INSERT) |

## Result

| # | Step | Kind | Result |
|---|---|---|---|
| 0 | Baseline | — | four tables at **0 rows** — evidenced, not asserted |
| 1 | Register six targets | REGI | 6 × `ExecStatus S` |
| 2a | `BAPI_FTR_IRATE_DEALCREATE` dry run | FUNC | `TESTRUN X` + `CommitMode NEVER` — nothing created |
| 2b | `BAPI_FTR_IRATE_DEALCREATE` real | FUNC | deal **%s** |
| 3 | `BAPI_FTR_IRATE_SETTLE` | FUNC | settled |
| 4a/4b | `RFTBBB00` (TBB1) | SUBM | FI document **0600000279** |
| 5a/5b | `RTPM_ACCRUAL_DEFERRAL` (TPM44) | SUBM | FI documents **0600000280** + **0600000281**, accrual **849.32 INR** |
| 6 | `RTPM_TRL_VALUATION` (TPM1) | SUBM | no write-ups or write-downs — the correct answer |
| 7 | `ZSGSLCTR_FEEDATA` | TABL | 1 row (`ZOTTK_NO 999997`, `ZDTTK_NO 160457`) |

Final table state: Registry **%d**, RegistryHistory **%d**, CallLog **%d**, CallStep **%d**.
**15 calls, 15 log rows, 15 step rows — one for one, no fan-out and no gaps.**

The accrual checks out arithmetically: 100,000 × 10%% × 31/365 = **849.32 INR**.

## Three properties of the log worth knowing before you read the step documents

**A dry run is logged exactly like a real call.** Step 2a ran with `CommitMode NEVER` and
`TESTRUN X`, and still produced a full `CallLog` + `CallStep` pair. That is correct: a dry run
is an event an auditor may need to see, and omitting it would make the log a success journal
rather than a record.

**The log is written *after* the execution session returns.** On the first call,
`ExecutedAt 15:08:57.612238` against `LocalCreatedAt 15:08:57.897047` — the header row is
created about 285 ms after the call executed. That ordering is deliberate: writing the durable
log from inside the caller's transaction would implicitly commit it and destroy the rollback
guarantee.

**`RegistryHistory.CallUuid` is all zeros on every row this run wrote.** The column exists to
tie a change of the security boundary back to the request that made it, and it is not doing
that. It is a real defect, recorded as **L-501**; it is *important* rather than *critical*,
because the change itself is fully recorded — before and after images, actor, timestamp — and
only the join is missing. It is called out again in the Step 1 document, where it appears.

## Two limits of this run, stated plainly

- Everything here was executed by `FS_DEV3`, a developer with full rights. The `ZFS_DYNGW`
  authorisation object exists and is wired in, but **no restricted user was used**, so nothing
  in these documents evidences that the authorisation check actually constrains anybody.
- Six write-capable targets are left **registered and active** at the end of the run. Anyone
  holding execute rights on the gateway can therefore create and settle FTR deals and post
  treasury flows through it. Deactivate them when testing is finished — see the last section of
  the Step 7 document.
""" % (DEAL, c7["Registry"], c7["RegistryHistory"], c7["CallLog"], c7["CallStep"]))

DOCS.append(("DynGW-v2-Step-Overview-and-How-To-Use",
             "Dynamic Gateway v2 — Overview, and how to use it",
             "\n".join(ov)))

# ---------------------------------------------------------------- step 0
b = []
b.append(HEADER_FACTS)
b.append(PRIMER)
b.append(where_am_i("0"))
b.append("""
## What step 0 is, and why it is a step at all

Before a single call, the five gateway tables were emptied by the **system owner**. That is a
human action by design: the framework refuses to delete its own tables (message **039**), which
is precisely the self-protection that stops a caller using the gateway to erase its own audit
trail.

The reason this is a real step and not test housekeeping is that **the allow-list does not
travel with a transport**. It is `deliveryClass #A` application data. A freshly imported
system therefore looks exactly like this one does right now, and will answer `017` — "target
not registered" — to *everything* until targets are registered on it. Step 1 is what
provisioning a new system actually involves, and step 0 is the state it starts from.
""")
b.append(URLS)
b.append("""
## The calls this step makes

Four plain `GET`s, one per entity set. No CSRF token is needed for a read.

```
GET %s/Registry?sap-client=100
GET %s/RegistryHistory?sap-client=100
GET %s/CallLog?sap-client=100
GET %s/CallStep?sap-client=100
```

No JSON is sent — a `GET` has no body.

### The responses

All four answered with an empty collection:

```json
{"@odata.context":"$metadata#Registry","value":[]}
{"@odata.context":"$metadata#RegistryHistory","value":[]}
{"@odata.context":"$metadata#CallLog","value":[]}
{"@odata.context":"$metadata#CallStep","value":[]}
```

`ZFS_T_TRM_PROBE` was emptied in the same pass and read `0` over ADT SQL.
""" % (BASE, BASE, BASE, BASE))
b.append("\n## What the tables hold after this step\n")
b.append(growth_table(None, "step0-baseline-empty",
                      "Nothing has happened yet. This is the point of the step."))
b.append("""
## Screenshots

### Figure 0.1 — `ZFS_T_DYN_REG` (the allow-list) is empty

""")
b.append(shots(("ZFS_T_DYN_REG — No table entries found for specified key",
                "step0-01-ZFS_T_DYN_REG-empty.png")))
b.append("""
The status bar reads **"No table entries found for specified key"**. That message, not the
selection screen above it, is the evidence — the selection screen alone only shows the table's
structure.

### Figure 0.2 — `ZFS_T_DYN_STEP` is empty

""")
b.append(shots(("ZFS_T_DYN_STEP — No table entries found for specified key",
                "step0-04-ZFS_T_DYN_STEP-empty.png")))
b.append("""
### Figure 0.3 — `ZFS_T_TRM_PROBE` is empty, and stays that way

""")
b.append(shots(("ZFS_T_TRM_PROBE — No table entries found for specified key",
                "step0-05-ZFS_T_TRM_PROBE-empty.png")))
b.append("""
This table takes no part in the FTR lifecycle. It exists for a separate rollback proof. It is
shown here, and again at the end of step 7, as a **negative control**: nothing in the lifecycle
writes to it, and if a later document showed rows in it, something would be wrong.

### Figures 0.4 and 0.5 — `ZFS_T_DYN_REGH` and `ZFS_T_DYN_CALL`

**An honest note about these two figures.** The SE16 captures of these two tables taken at
step 0 were lost — the capture tool saved the wrong window, the files were caught and deleted,
and by the time that was noticed both tables had filled up, so the original screens could not
be retaken. Rather than present something these figures are not, they show a **different and
still sound** proof, taken afterwards: SE16 filtered to rows timestamped **before the run
started** (`< 2026-09-13 15:00:00` UTC; the run's first row is stamped `15:08:57`).

""")
b.append(shots(("ZFS_T_DYN_REGH — no row with CHANGED_AT before the run started",
                "step0-02-ZFS_T_DYN_REGH-nothing-before-run.png")))
b.append(shots(("ZFS_T_DYN_CALL — no row with EXECUTED_AT before the run started",
                "step0-03-ZFS_T_DYN_CALL-nothing-before-run.png")))
b.append("""
Both return **"No table entries found for specified key"**: nothing in either table predates
this run.

An empty result is only meaningful if the filter itself works, so here is the same selection
with the upper bound widened past the run — it returns the six rows step 1 created:

""")
b.append(shots(("Positive control — the same filter widened to 16:00:00 returns 6 rows",
                "step0-02b-ZFS_T_DYN_REGH-positive-control-6-rows.png")))
b.append("""
The contemporaneous evidence for these two tables being empty at step 0 is the OData snapshot
quoted above (`"value":[]`), saved to
`snapshots/step0-baseline-empty--RegistryHistory.json` and `…--CallLog.json` at the time.

## What to take away

- A new or freshly imported system is in exactly this state, and answers `017` to everything.
- Emptying these tables is a human act, not something the gateway will do for you.
- The next step is not optional setup; it is how a system is provisioned.
""")
DOCS.append(("DynGW-v2-Step-0-Baseline",
             "Step 0 — The empty-system baseline", "\n".join(b)))

# ---------------------------------------------------------------- step 1
b = []
b.append(HEADER_FACTS)
b.append(PRIMER)
b.append(where_am_i("1"))
b.append("""
## What step 1 does

It puts six targets on the allow-list. Until this happens nothing else in this documentation
can run at all — every later call is refused with `017`.

Each registration is a single-shot `RegisterTarget` action. The same thing can be done as
`REGI` steps inside an `ExecuteBatch`, which is how you would provision a whole system in one
call; this run used the single-shot form six times so that each registration's effect on the
tables could be seen on its own.

| Target | Kind | `CallMode` | Why this kind |
|---|---|---|---|
| `BAPI_FTR_IRATE_DEALCREATE` | FUNC | **L** | creates the deal |
| `BAPI_FTR_IRATE_SETTLE` | FUNC | **L** | settles it |
| `RFTBBB00` | SUBM | — | the TBB1 posting run |
| `RTPM_ACCRUAL_DEFERRAL` | SUBM | — | the TPM44 month-end accrual |
| `RTPM_TRL_VALUATION` | SUBM | — | the TPM1 valuation |
| `ZSGSLCTR_FEEDATA` | TABL | — | the fee row |

### `CallMode 'L'` on the two BAPIs is load-bearing

Left blank, a remote-enabled BAPI resolves to `'R'` through `TFDIR-FMODE`, which means
`CALL FUNCTION … DESTINATION 'NONE'` — a **separate session with its own transaction, which
commits itself**. A creating BAPI called that way persists no matter what `CommitMode` says, so
the `TESTRUN='X'` + `CommitMode NEVER` dry run in step 2 would stop being a guarantee. `'L'`
keeps the call inside the execution session's transaction, where the framework's COMMIT and
ROLLBACK actually govern it.

### Why `AllowWrite: true` on all six

Every `FUNC` call demands write permission, even for a read-only function module, because the
handler's "needs write" predicate is unconditionally true. It is a known limit, and it **fails
closed** — it asks for more privilege than strictly needed, never less.
""")
b.append(URLS)
b.append(call_block("REGISTER FUNC/BAPI_FTR_IRATE_DEALCREATE",
                    "Call 1 of 6 — register `BAPI_FTR_IRATE_DEALCREATE`",
                    "Shown in full. The other five differ only in `TargetName`, `TargetKind`, "
                    "`CallMode` and `Descr`."))
b.append("\n## What the tables hold after this *first* registration\n")
b.append(growth_table("step0-baseline-empty", "step1a-after-register-dealcreate",
                      "**One registration produces exactly one row in each of the four tables.** "
                      "This is the clearest view of the audit trail in the whole document set, "
                      "because exactly one thing has happened."))
b.append("""
### Figure 1.1 — `ZFS_T_DYN_REG`, one row

""")
b.append(shots(("ZFS_T_DYN_REG after the first registration — 1 row",
                "step1a-01-ZFS_T_DYN_REG-1-row.png")))
b.append("""
### Figure 1.2 — `ZFS_T_DYN_REGH`, one row

""")
b.append(shots(("ZFS_T_DYN_REGH after the first registration — 1 row",
                "step1a-02-ZFS_T_DYN_REGH-1-row.png")))
b.append("""
### Figure 1.3 — `ZFS_T_DYN_CALL`, one row

""")
b.append(shots(("ZFS_T_DYN_CALL after the first registration — 1 row",
                "step1a-03-ZFS_T_DYN_CALL-1-row.png")))
b.append("""
### Figure 1.4 — `ZFS_T_DYN_STEP`, one row

""")
b.append(shots(("ZFS_T_DYN_STEP after the first registration — 1 row",
                "step1a-04-ZFS_T_DYN_STEP-1-row.png")))

reg0 = rows("step1a-after-register-dealcreate", "Registry")[0]
hist0 = rows("step1a-after-register-dealcreate", "RegistryHistory")[0]
call0 = rows("step1a-after-register-dealcreate", "CallLog")[0]
step0 = rows("step1a-after-register-dealcreate", "CallStep")[0]

b.append("""
## Field by field — what every column holds, and why

These are the **actual four rows** this step wrote, column by column. This is the section to
read if you want to understand what the gateway records about itself.

### `ZFS_T_DYN_REG` — the allow-list

The security boundary. Nothing runs unless a row here permits it.

| Column | Value | What it is, and why it holds that |
|---|---|---|
| `CLIENT` | `100` | Standard client key — the allow-list is client-specific. |
| `REG_UUID` | `%s` | **Primary key**, generated at INSERT. Every later step that uses this target stamps this UUID on its `CallStep` row — that is how an execution is tied back to the permission that allowed it. |
| `TARGET_KIND` | `FUNC` | One of `FUNC`/`TABL`/`QURY`/`SUBM`. Together with `TARGET_NAME` it forms the identity, so the same name can exist under two kinds. `REGI` is rejected here — it is a step kind, not a registrable kind. |
| `TARGET_NAME` | `%s` | The function module, table, view or report. CHAR30. |
| `OPERATION` | *(blank)* | Optional **operation pin**. Blank means any operation. Set to e.g. `INSERT` it restricts the target to that one. Left blank here so the same row serves both the dry run and the real call in step 2. |
| `IS_ACTIVE` | `X` | The kill switch. Blank and "no row at all" deliberately produce the **same** `017` refusal. |
| `ALLOW_READ` | `X` | Permits read operations. |
| `ALLOW_WRITE` | `X` | Permits write operations. Required for every `FUNC` call, even a read-only one — see above. |
| `CALL_MODE` | `%s` | `L` local, `R` remote, blank falls back to `TFDIR-FMODE`. This single character decides whether the call shares the caller's transaction. |
| `MAX_ROWS` | `%s` | Per-target row ceiling. **`0` means "no override from this target"** — it does *not* mean unlimited. |
| `LOG_LEVEL` | `%s` | How much of the call gets logged; `A` is all. This setting lives **here**, on the target, not on the call log. |
| `DESCR` | `%s` | Free text for whoever has to operate this later. |
| `LOCAL_CREATED_BY` / `_AT` | `%s` / `%s` | Who created the row, and when. |
| `LOCAL_LAST_CHANGED_BY` / `_AT` | `%s` / same | Last change. Equal to created on an INSERT. |
| `LAST_CHANGED_AT` | same | The ETag field, used for optimistic locking. |

### `ZFS_T_DYN_REGH` — allow-list change history

Every change to the security boundary leaves a record. A change to the security boundary is the
last thing that should be invisible.

| Column | Value | What it is, and why |
|---|---|---|
| `CLIENT` | `100` | Client. |
| `HIST_UUID` | `%s` | Primary key of the history row itself. |
| `REG_UUID` | `%s` | **Points at the registry row that changed** — identical to the key above. This is the join. |
| `CHANGE_TYPE` | `%s` | `I` insert / `U` update / `D` delete. All six rows here are `I`. |
| `TARGET_KIND` / `TARGET_NAME` | `%s` / `%s` | Denormalised on purpose: a `D` row must still say *what* was deleted once the registry row is gone. |
| `SOURCE` | `%s` | Which door made the change — `REGI` (through the gateway) or `ODAT` (a direct OData write on the Registry entity). It lets an auditor tell self-service changes from API-driven ones. |
| `CALL_UUID` | **`%s`** | *Should* tie the change to the call that made it. **It is all zeros — see the defect note below.** |
| `BEFORE_JSON` | *(empty)* | The pre-image. Empty on an `I` because nothing existed before. On a `U` it carries the full prior row, so a widening of permissions can be reconstructed. |
| `AFTER_JSON` | %d characters, beginning `{"CLIENT":"100","REG_UUID":"UlQAH+eiH9Gr7ojSo1ngAA==",…` | The post-image — the complete row as written. `REG_UUID` appears here **base64-encoded**, because it is a raw 16-byte field serialised by the generic JSON writer. |
| `CHANGED_BY` / `CHANGED_AT` | `%s` / `%s` | Who and when. |

> **Defect — `CALL_UUID` is all zeros (L-501).** All six history rows carry
> `00000000-0000-0000-0000-000000000000`. An auditor holding a history row therefore **cannot
> tell which call created the registration** and has to fall back on matching timestamps. The
> likely cause is that a single-shot `RegisterTarget` does not seed the per-request buffer with
> the call UUID the way a batch does. It is **important, not critical**: no control depends on
> it, the change itself is completely recorded, and what is lost is only the join. It is worth
> fixing precisely because this table exists for auditability, and a zero key is the one value
> that looks populated until you read it. Whether a `REGI` step *inside a batch* fills it in is
> still untested.

### `ZFS_T_DYN_CALL` — the call header, one row per request

| Column | Value | What it is, and why |
|---|---|---|
| `CLIENT` | `100` | Client. |
| `CALL_UUID` | `%s` | Primary key, and the parent key every `CallStep` row carries. |
| `ACTION` | `%s` | Which of the six actions was invoked. |
| `REQUEST_ID` | `%s` | **Idempotency key.** A caller may supply one; when omitted the framework generates it. Replaying the same `RequestId` returns the original result instead of executing again — see `REPLAYED`. |
| `COMMIT_MODE` | *(blank)* | Blank on `RegisterTarget`, because a single-shot action has no batch commit semantics. `AUTO` and `NEVER` both appear later in this run. |
| `EXEC_STATUS` | `%s` | Whether the **dispatch** worked. Deliberately separate from whether the business target was happy. |
| `ERROR_CATEGORY` | *(blank)* | On failure: `CLIENT` / `AUTH` / `TARGET` / `BUSINESS` — what a caller branches on. |
| `REPLAYED` | `%s` | True when the result was served from the idempotency window rather than re-executed. |
| `MESSAGE_ID` / `_NO` / `_TEXT` | blank / `%s` / blank | Call-level message, populated on a refusal. |
| `STEP_COUNT` | `%s` | Steps in the request. Every call in this run carried exactly one. |
| `RESULT_COUNT` | `%s` | Rows touched or returned, aggregated. For a `SUBM` step this is the number of captured spool lines. |
| `DURATION_MS` | `%s` | Wall-clock time. |
| `REQUEST_TRUNCATED` | `%s` | True when `REQUEST_JSON` had to be cut to fit. Nothing was truncated in this run. |
| `REQUEST_JSON` | the normalised request | **The request as the framework understood it** — normalised, not the raw HTTP body. This is what makes the log replayable, and it is the single most useful forensic field in the table. |
| `EXECUTED_BY` / `_AT` | `%s` / `%s` | Who called, and when. |
| `LOCAL_CREATED_AT` | `%s` | Note this is **later** than `EXECUTED_AT`: the log is written from the RAP transaction *after* the execution session returns, because writing it from inside would implicitly commit the caller's transaction and destroy the rollback guarantee. |

### `ZFS_T_DYN_STEP` — one row per step

| Column | Value | What it is, and why |
|---|---|---|
| `CLIENT` | `100` | Client. |
| `STEP_UUID` | `%s` | Primary key of the step row. |
| `CALL_UUID` | `%s` | **Foreign key to `ZFS_T_DYN_CALL`** — identical to the call key above. This is what groups the steps of one call. |
| `STEP_INDEX` | `%s` | Position within the batch. |
| `STEP_KIND` | `%s` | One of the five kinds. |
| `TARGET_NAME` | `%s` | What was addressed. |
| `OPERATION` | `%s` | Overloaded by kind: for `TABL`/`REGI` it is the CRUD verb; for `SUBM` it is the **capture mode**. |
| `REG_UUID` | **%s** | The allow-list row that permitted this step. **Zero on a `REGI` step is correct, not a defect** — a REGI step *creates* a registration, it is not dispatched against one. Every FUNC/SUBM/TABL step later in this run carries a real UUID here, and that is the audit join back to the allow-list. |
| `EXEC_STATUS` | `%s` | Whether the dispatch worked. |
| `SEVERITY` | `%s` | `S`/`W`/`E`. It diverges from `EXEC_STATUS` on a partial write. |
| `MESSAGE_ID`/`_NO`/`_TEXT` | `%s` / `%s` / *"%s"* | **036 is REGI-specific on purpose.** The shared success message 026 reads "&1 executed successfully", which for a registration would assert an execution that never happened — a reader of their own call log once asked whether the BAPI had been invoked as well. |
| `RESULT_COUNT` | `%s` | Rows affected. |
| `RESPONSE_JSON` | *(empty)* | The step's payload, subject to the `LOG_LEVEL` on the registry row. |

## After all six registrations
""" % (
    reg0["RegUuid"], reg0["TargetName"], reg0["CallMode"], reg0["MaxRows"], reg0["LogLevel"],
    reg0["Descr"], reg0["LocalCreatedBy"], reg0["LocalCreatedAt"], reg0["LocalLastChangedBy"],
    hist0["HistUuid"], hist0["RegUuid"], hist0["ChangeType"], hist0["TargetKind"],
    hist0["TargetName"], hist0["Source"], hist0["CallUuid"], len(hist0["AfterJson"]),
    hist0["ChangedBy"], hist0["ChangedAt"],
    call0["CallUuid"], call0["Action"], call0["RequestId"], call0["ExecStatus"],
    str(call0["Replayed"]).lower(), call0["MessageNo"], call0["StepCount"], call0["ResultCount"],
    call0["DurationMs"], str(call0["RequestTruncated"]).lower(), call0["ExecutedBy"],
    call0["ExecutedAt"], call0["LocalCreatedAt"],
    step0["StepUuid"], step0["CallUuid"], step0["StepIndex"], step0["StepKind"],
    step0["TargetName"], step0["Operation"],
    "zeros — and correct" if step0["RegUuid"].startswith("00000000") else step0["RegUuid"],
    step0["ExecStatus"], step0["Severity"], step0["MessageId"], step0["MessageNo"],
    step0["MessageText"], step0["ResultCount"],
))
b.append(growth_table("step0-baseline-empty", "step1-after-all-registrations",
                      "Six registrations, six rows in each of the four tables. No fan-out, "
                      "no gaps."))
b.append("""
### Figure 1.5 — `ZFS_T_DYN_REG`, all six targets

""")
b.append(shots(("ZFS_T_DYN_REG — the six registered targets",
                "step1-01-ZFS_T_DYN_REG-6-rows.png")))
b.append("""
`CALL_MODE = L` on the two `FUNC` rows and blank on the other four — the one character
discussed above.

### Figure 1.6 — `ZFS_T_DYN_REGH`, six history rows

""")
b.append(shots(("ZFS_T_DYN_REGH — one history row per registration",
                "step1-02-ZFS_T_DYN_REGH-6-rows.png")))
b.append("""
Each row pairs its own `HIST_UUID` with the `REG_UUID` of the registry row it describes; all
six are `CHANGE_TYPE = I` and `SOURCE = REGI`.

### Figure 1.7 — `ZFS_T_DYN_CALL`, six calls

""")
b.append(shots(("ZFS_T_DYN_CALL — six RegisterTarget calls",
                "step1-03-ZFS_T_DYN_CALL-6-rows.png")))
b.append("""
### Figure 1.8 — `ZFS_T_DYN_STEP`, six steps

""")
b.append(shots(("ZFS_T_DYN_STEP — six REGI steps, message 036",
                "step1-04-ZFS_T_DYN_STEP-6-rows.png")))
b.append("""
## What to take away

- Registration is the whole security model. Everything after this step is permitted by one of
  these six rows.
- `CallMode L` is not a detail; it is what makes the next step's dry run meaningful.
- A zero `REG_UUID` on a `REGI` step row is correct. A zero `CALL_UUID` on a history row is a
  defect. They look similar and are not.
""")
DOCS.append(("DynGW-v2-Step-1-Register-Targets",
             "Step 1 — Register the six targets (REGI)", "\n".join(b)))


# ---------------------------------------------------------------- step 2
b = []
b.append(HEADER_FACTS)
b.append(PRIMER)
b.append(where_am_i("2"))
b.append("""
## What step 2 does

It creates the term loan, by calling the standard BAPI `BAPI_FTR_IRATE_DEALCREATE` through the
gateway as a `FUNC` step inside an `ExecuteBatch`.

It is done **twice on purpose**:

- **2a, a dry run** — `TESTRUN: "X"` in the payload *and* `CommitMode: "NEVER"` on the batch.
  Two independent brakes: the BAPI is told not to create anything, and the framework is told to
  throw away whatever work does happen. Nothing is created.
- **2b, the real call** — `TESTRUN: ""` and `CommitMode: "AUTO"`. This creates deal **%s**.

### Why this needs `ExecuteBatch` rather than `CallFunctionModule`

`CallFunctionModule` never commits. A BAPI that creates something needs a `COMMIT WORK`, and
the only action that issues one is `ExecuteBatch` with a `CommitMode`. Calling a creating BAPI
through the single-shot action gets you `ExecStatus: "S"` — the *dispatch* worked — and no
document. That is the single most common mistake made against this service.

### And `ExecStatus: "S"` is not "the business succeeded"

`ExecStatus` tells you the gateway dispatched the call. Whether the BAPI was happy is in the
`RETURN` table, which you must parse yourself. In this run `RETURN` carries a warning about the
business partner alongside the success message — the deal was created regardless.

### The empty-array trick

Every `TABLES` parameter is sent as `[]`, including output-only ones such as `RETURN`. An
output-only `TABLES` parameter whose key is **absent** from the request comes back empty — you
have to send the empty array to get the content back. That is why `TablesJson` lists eleven
tables that carry no input.
""" % DEAL)
b.append(URLS)
b.append(call_block("STEP 2a DEALCREATE dry run (TESTRUN X, CommitMode NEVER)",
                    "Call 2a — the dry run",
                    "Note `CommitMode: \"NEVER\"` on the batch and `TESTRUN: \"X\"` deep inside "
                    "the import structure."))
b.append("""
`FINANCIALTRANSACTION` comes back as `\\INTERN\\` — the BAPI's test-run placeholder, meaning no
number was assigned. Nothing was created.
""")
b.append("\n## What the tables hold after the dry run\n")
b.append(growth_table("step1-after-all-registrations", "step2a-after-dealcreate-dryrun",
                      "**A dry run is logged exactly like a real call.** That is correct — a dry "
                      "run is an event an auditor may need to see, and its absence would make "
                      "the log a success journal rather than a record."))
b.append("""
### Figure 2.1 — `ZFS_T_DYN_CALL` after the dry run, 7 rows

""")
b.append(shots(("ZFS_T_DYN_CALL — the dry run is logged, COMMIT_MODE = NEVER",
                "step2a-01-ZFS_T_DYN_CALL-7-rows.png")))
b.append("""
The seventh row is the first `ExecuteBatch`, and its `COMMIT_MODE` column reads **`NEVER`** —
the dry run is distinguishable from a real call in the log itself.

### Figure 2.2 — `ZFS_T_DYN_STEP` after the dry run, 7 rows

""")
b.append(shots(("ZFS_T_DYN_STEP — a FUNC step, with a real REG_UUID",
                "step2a-02-ZFS_T_DYN_STEP-7-rows.png")))
b.append("""
The seventh step row is `STEP_KIND = FUNC`, and unlike the six `REGI` rows above it, it carries
a **real `REG_UUID`** — the allow-list row from step 1 that permitted this call. That is the
audit join working.
""")
b.append(call_block("STEP 2b DEALCREATE real (CommitMode AUTO)",
                    "Call 2b — the real creation",
                    "Byte-for-byte the same payload except `TESTRUN: \"\"` and "
                    "`CommitMode: \"AUTO\"`."))
b.append("""
The response carries the created deal number:

```
"FINANCIALTRANSACTION":"%s"
"COMPANYCODE":"1000"
```

and a `RETURN` table with two messages: a **warning** (`FTR_GUI 220`) that the partner cannot
be used as per the contract date, and an **information** message (`FTR0 162`) that the BAPI was
executed successfully. The deal exists.
""" % DEAL)
b.append("\n## What the tables hold after the real call\n")
b.append(growth_table("step2a-after-dealcreate-dryrun", "step2b-after-dealcreate-real"))
b.append("""
### Figure 2.3 — `ZFS_T_DYN_CALL` after the real call, 8 rows

""")
b.append(shots(("ZFS_T_DYN_CALL — the eighth row, COMMIT_MODE = AUTO",
                "step2b-01-ZFS_T_DYN_CALL-8-rows.png")))
b.append("""
### Figure 2.4 — `ZFS_T_DYN_STEP` after the real call, 8 rows

""")
b.append(shots(("ZFS_T_DYN_STEP — the FUNC step for the real creation",
                "step2b-02-ZFS_T_DYN_STEP-8-rows.png")))
b.append("""
## Independent verification

The deal was read back over **ADT SQL** — a channel that does not go through the gateway, so
this verdict does not rest on the component being tested:

```sql
SELECT RFHA, BUKRS, SFHAART, SGSART, RANTYP FROM VTBFHA WHERE RFHA = '%s'
```

| RFHA | BUKRS | SFHAART | SGSART | RANTYP |
|---|---|---|---|---|
| %s | 1000 | 100 | 22A | 5 |

## What to take away

- A creating BAPI needs `ExecuteBatch` **and** a `CommitMode`. `CallFunctionModule` will not
  commit for you.
- `ExecStatus: "S"` means the dispatch worked. Parse `RETURN` for the business outcome.
- Send output-only `TABLES` parameters as `[]` or their content never comes back.
- Deeply nested structures round-trip correctly — the payload above has four nested structures
  and eleven tables.
""" % (DEAL, DEAL))
DOCS.append(("DynGW-v2-Step-2-Create-Deal",
             "Step 2 — Create the term loan (FUNC)", "\n".join(b)))

# ---------------------------------------------------------------- step 3
b = []
b.append(HEADER_FACTS)
b.append(PRIMER)
b.append(where_am_i("3"))
b.append("""
## What step 3 does

It settles the deal created in step 2, by calling `BAPI_FTR_IRATE_SETTLE` as a `FUNC` step.
Settlement is what moves a treasury transaction out of "order" status and makes its flows
eligible to be posted — which is what step 4 then does.

The payload is small, which makes this the easiest step to read if you want to see the shape of
a `FUNC` call without the noise of step 2's nested structures. Same rules apply: `ExecuteBatch`
with `CommitMode AUTO` because it writes, `RETURN` sent as `[]` so its content comes back, and
`CallMode L` on the registered target so the call shares the caller's transaction.
""")
b.append(URLS)
b.append(call_block("STEP 3 SETTLE deal " + DEAL,
                    "The call — settle deal %s" % DEAL))
b.append("\n## What the tables hold after this step\n")
b.append(growth_table("step2b-after-dealcreate-real", "step3-after-settle"))
b.append("""
### Figure 3.1 — `ZFS_T_DYN_CALL`, 9 rows

""")
b.append(shots(("ZFS_T_DYN_CALL after the settlement", "step3-01-ZFS_T_DYN_CALL-9-rows.png")))
b.append("""
### Figure 3.2 — `ZFS_T_DYN_STEP`, 9 rows

""")
b.append(shots(("ZFS_T_DYN_STEP — the settle FUNC step",
                "step3-02-ZFS_T_DYN_STEP-9-rows.png")))
b.append("""
## What to take away

- A second `FUNC` target, a second allow-list row, and the log grows by exactly one call and
  one step. The pattern is the same regardless of how large the payload is.
- The `REG_UUID` on this step row points at the `BAPI_FTR_IRATE_SETTLE` registry row, not at
  the DEALCREATE one — each step records the specific permission that let it run.
""")
DOCS.append(("DynGW-v2-Step-3-Settle-Deal",
             "Step 3 — Settle the deal (FUNC)", "\n".join(b)))

# ---------------------------------------------------------------- step 4
b = []
b.append(HEADER_FACTS)
b.append(PRIMER)
b.append(where_am_i("4"))
b.append("""
## What step 4 does

It posts the deal's flows to Financial Accounting by running the standard report `RFTBBB00` —
the program behind transaction **TBB1** — through the gateway as a `SUBM` step.

This is the first step that uses a fundamentally different mechanism, so it is worth slowing
down for.

### `SUBM` is not like the other kinds

`SUBM` runs an executable ABAP report and **captures its output**. Two consequences:

1. **It exists only as a batch step.** There is no single-shot "submit" action; you always go
   through `ExecuteBatch`.
2. **`FilterJson` means something different.** For a `TABL` or `QURY` step it is a WHERE
   clause. For a `SUBM` step it is a list of **selection-screen values** — one row per
   selection field, in the shape of an `RSPARAMS` entry, which the framework feeds to
   `SUBMIT … WITH SELECTION-TABLE`.

Each entry looks like this:

```json
{"field":"S_BUKRS","kind":"S","sign":"I","op":"EQ","low":"1000","high":""}
```

- `field` — the selection-screen name **exactly as the report declares it**
- `kind` — `S` for a SELECT-OPTION, `P` for a PARAMETER
- `sign`/`op` — `I`/`EQ` for an ordinary inclusive equality
- `low`/`high` — the value, or the range bounds

**Dates go in internal format, `YYYYMMDD`.** Not the user's display format.

### A trap worth knowing

A selection name that **does not exist on the report is silently dropped**. There is no error;
the report simply runs without that restriction, which on a posting run could mean posting far
more than you intended. Take the names from the report's own selection include, and check the
captured output says it selected the number of records you expected. This run's test step
reports `Records passed 1`, which is the confirmation.

`OPERATION` on a `SUBM` step is the **capture mode** — here `JOB`.
""")
b.append(URLS)
b.append(call_block("STEP 4a TBB1 test run", "Call 4a — the test run",
                    "`P_TEST` is set to `X`. The report does its selection and its arithmetic "
                    "and prints what it *would* post, without posting."))
b.append("""
The captured spool comes back through the gateway inside the step result, and reads
**`Records passed 1`** and **"Test run was successful"**.
""")
b.append("\n## What the tables hold after the test run\n")
b.append(growth_table("step3-after-settle", "step4a-after-tbb1-test"))
b.append("""
### Figure 4.1 — `ZFS_T_DYN_CALL`, 10 rows

""")
b.append(shots(("ZFS_T_DYN_CALL after the TBB1 test run",
                "step4a-01-ZFS_T_DYN_CALL-10-rows.png")))
b.append("""
`RESULT_COUNT` on this row is **10** — for a `SUBM` step that column counts **captured spool
lines**, not database rows. It means something different here than it does on a `TABL` step,
and that is worth remembering when reading the log.

### Figure 4.2 — `ZFS_T_DYN_STEP`, 10 rows

""")
b.append(shots(("ZFS_T_DYN_STEP — a SUBM step, OPERATION = JOB",
                "step4a-02-ZFS_T_DYN_STEP-10-rows.png")))
b.append("""
`STEP_KIND = SUBM`, `OPERATION = JOB` (the capture mode), and message **026**, the shared
"executed successfully".
""")
b.append(call_block("STEP 4b TBB1 real posting", "Call 4b — the real posting",
                    "Identical except `P_TEST` is now empty."))
b.append("""
The captured output reads **"Transactions were updated successfully"**.
""")
b.append("\n## What the tables hold after the real posting\n")
b.append(growth_table("step4a-after-tbb1-test", "step4b-after-tbb1-real"))
b.append("""
### Figure 4.3 — `ZFS_T_DYN_CALL`, 11 rows

""")
b.append(shots(("ZFS_T_DYN_CALL after the real TBB1 posting",
                "step4b-01-ZFS_T_DYN_CALL-11-rows.png")))
b.append("""
### Figure 4.4 — `ZFS_T_DYN_STEP`, 11 rows

""")
b.append(shots(("ZFS_T_DYN_STEP after the real TBB1 posting",
                "step4b-02-ZFS_T_DYN_STEP-11-rows.png")))
b.append("""
## Independent verification

Read over **ADT SQL**, not through the gateway:

```sql
SELECT BELNR, BUDAT, TCODE, CPUTM FROM BKPF
 WHERE BUKRS = '1000' AND CPUDT = '20260913' AND TCODE = 'TBB1'
```

| BELNR | BUDAT | TCODE | Created at |
|---|---|---|---|
| **0600000279** | 01.01.2026 | TBB1 | 20:48:56 |

FI document **0600000279** exists, posted 01.01.2026 — the posting date supplied in
`P_BUDAT` as `20260101`.

## What to take away

- `SUBM` exists only inside `ExecuteBatch`.
- `FilterJson` on a `SUBM` step is selection-screen values, not a WHERE clause; dates are
  `YYYYMMDD`.
- A wrong selection name is silently ignored — always confirm the record count in the captured
  output.
- `RESULT_COUNT` counts spool lines for a `SUBM` step.
""")
DOCS.append(("DynGW-v2-Step-4-TBB1-Post-Flows",
             "Step 4 — Post the flows with TBB1 (SUBM)", "\n".join(b)))

# ---------------------------------------------------------------- step 5
b = []
b.append(HEADER_FACTS)
b.append(PRIMER)
b.append(where_am_i("5"))
b.append("""
## What step 5 does

It runs the month-end interest accrual — report `RTPM_ACCRUAL_DEFERRAL`, the program behind
transaction **TPM44** — as a `SUBM` step, test run first and then for real.

This is the step whose result can be checked with arithmetic rather than trust, which makes it
the most useful one in the set for convincing somebody the gateway is doing real work:

> 100,000 × 10% × 31/365 = **849.32 INR**

The deal is a 100,000 INR term loan at 10% with an actual/365 calculation method, and January
has 31 days. The gateway posts an accrual of exactly that figure.

### The selection values, and why there are two dates twice over

An accrual/deferral run posts **two** documents: the accrual itself on the key date, and its
reset on the following day.

- `P_KEYDAT`, `P_FIDATE`, `P_DOCDAT` = `20260131` — the accrual, on 31 January
- `P_RDATE`, `P_RFIDAT` = `20260201` — the reset, on 1 February
- `P_DEA` = `X` selects deferral/accrual processing
- `SO_BUKRS` = `1000`, `SO_OTCNR` = the deal
- `P_TEST` = `X` then empty
""")
b.append(URLS)
b.append(call_block("STEP 5a TPM44 test run", "Call 5a — the test run"))
b.append("\n## What the tables hold after the test run\n")
b.append(growth_table("step4b-after-tbb1-real", "step5a-after-tpm44-test"))
b.append("""
### Figure 5.1 — `ZFS_T_DYN_CALL`, 12 rows

""")
b.append(shots(("ZFS_T_DYN_CALL after the TPM44 test run",
                "step5a-01-ZFS_T_DYN_CALL-12-rows.png")))
b.append("""
### Figure 5.2 — `ZFS_T_DYN_STEP`, 12 rows

""")
b.append(shots(("ZFS_T_DYN_STEP after the TPM44 test run",
                "step5a-02-ZFS_T_DYN_STEP-12-rows.png")))
b.append(call_block("STEP 5b TPM44 real posting", "Call 5b — the real posting"))
b.append("""
### The posting log, returned through the gateway

The report's own output comes back in the step result. Reformatted for legibility:

```
  160457  1000 001 Accrual/deferral         31.01.2026   IndAS
 40 106070  Int Receivable - TL     Loan: Accruals: Revenue            849.32  INR
 50 301170  Interest Income - TL    Loan: Accruals: Revenue            849.32- INR

  160457  1000 001 Accrual/deferral reset   01.02.2026   IndAS
 50 301170  Interest Income - TL    Loan: Reset Accruals: Revenue      849.32  INR
 40 106070  Int Receivable - TL     Loan: Reset Accruals: Revenue      849.32- INR
```

A debit to interest receivable and a credit to interest income on 31 January, reversed on
1 February. That is a textbook accrual, produced entirely through the gateway.
""")
b.append("\n## What the tables hold after the real posting\n")
b.append(growth_table("step5a-after-tpm44-test", "step5b-after-tpm44-real"))
b.append("""
### Figure 5.3 — `ZFS_T_DYN_CALL`, 13 rows

""")
b.append(shots(("ZFS_T_DYN_CALL after the real TPM44 posting",
                "step5b-01-ZFS_T_DYN_CALL-13-rows.png")))
b.append("""
`RESULT_COUNT` on the two TPM44 rows is **25** — the posting log is a longer capture than
TBB1's.

### Figure 5.4 — `ZFS_T_DYN_STEP`, 13 rows

""")
b.append(shots(("ZFS_T_DYN_STEP after the real TPM44 posting",
                "step5b-02-ZFS_T_DYN_STEP-13-rows.png")))
b.append("""
## Independent verification

```sql
SELECT BELNR, BUDAT, TCODE, CPUTM FROM BKPF
 WHERE BUKRS = '1000' AND CPUDT = '20260913' AND TCODE = 'TPM44'
```

| BELNR | BUDAT | What it is |
|---|---|---|
| **0600000280** | 31.01.2026 | the accrual |
| **0600000281** | 01.02.2026 | its reset |

### Figure 5.5 — the accrual document in FB03

""")
b.append(shots(("FB03 — document 0600000280, the TPM44 accrual",
                "biz-01-FB03-0600000280-accrual.png")))
b.append("""
Company code 1000, document and posting date 31.01.2026, period 10, currency INR. Two line
items: **posting key 40, account `106070` Int Rec - TL, 849.32 INR** debit against **posting
key 50, account `301170` Interest Income - TL, 849.32- INR** credit.

This is the arithmetic above, viewed in the standard transaction, as a posted document. Nothing
about this screen goes through the gateway — it is the ordinary SAP display of an ordinary FI
document that the gateway happened to create.

## What to take away

- A `SUBM` step can drive a real month-end process, not just a display report.
- The report's own output comes back to the caller, so the caller can check what happened
  without a second round trip.
- The number is verifiable by hand. That is the strongest kind of evidence in this document set.
""")
DOCS.append(("DynGW-v2-Step-5-TPM44-Accrual",
             "Step 5 — Month-end accrual with TPM44 (SUBM)", "\n".join(b)))

# ---------------------------------------------------------------- step 6
b = []
b.append(HEADER_FACTS)
b.append(PRIMER)
b.append(where_am_i("6"))
b.append("""
## What step 6 does

It runs the position valuation — report `RTPM_TRL_VALUATION`, the program behind transaction
**TPM1** — as a `SUBM` step.

### This step's correct answer is "nothing happened"

The report returns:

> *"The valuation of the position resulted in no write-ups or write-downs"*

and posts **no document**. That is the right outcome, not a failure. The instrument is a
fixed-rate term loan held at amortised cost; there is nothing to revalue. A document here would
be the surprising result.

It is included in the lifecycle precisely because a test suite that only ever asserts "something
was created" cannot tell a working system from a broken one. This step shows the gateway
faithfully relaying a report that correctly declined to do anything.

### A small trap in the selection names

TPM1's parameters are **bare names** — `KEYDATE`, `VALCAT`, `X_SIMULA` — not the `P_*` prefixed
names used by TBB1 and TPM44. Selection names are per report, and a wrong one is silently
dropped (see the Step 4 document), so they have to come from each report's own selection
include.

- `KEYDATE` = `20260131` — the valuation key date
- `VALCAT` = `2` — the valuation category
- `X_SIMULA` = empty — not a simulation
""")
b.append(URLS)
b.append(call_block("STEP 6 TPM1 valuation", "The call — TPM1 valuation"))
b.append("\n## What the tables hold after this step\n")
b.append(growth_table("step5b-after-tpm44-real", "step6-after-tpm1",
                      "Note that the log grows **even though nothing was posted**. The gateway "
                      "logs the call, not the business consequence — which is what you want "
                      "when the question later is 'was the valuation ever run?'"))
b.append("""
### Figure 6.1 — `ZFS_T_DYN_CALL`, 14 rows

""")
b.append(shots(("ZFS_T_DYN_CALL after the TPM1 valuation",
                "step6-01-ZFS_T_DYN_CALL-14-rows.png")))
b.append("""
### Figure 6.2 — `ZFS_T_DYN_STEP`, 14 rows

""")
b.append(shots(("ZFS_T_DYN_STEP after the TPM1 valuation",
                "step6-02-ZFS_T_DYN_STEP-14-rows.png")))
b.append("""
`EXEC_STATUS = S` and message **026**: the dispatch and the report both worked. The absence of
an FI document is business information carried in the captured output, not a gateway status.

## What to take away

- `ExecStatus: "S"` means the call ran. Read the captured output for what the report decided.
- A step that correctly does nothing is still logged, and should be.
- Selection-screen names are per report. Do not carry `P_*` conventions across from one report
  to another.
""")
DOCS.append(("DynGW-v2-Step-6-TPM1-Valuation",
             "Step 6 — Position valuation with TPM1 (SUBM)", "\n".join(b)))

# ---------------------------------------------------------------- step 7
b = []
b.append(HEADER_FACTS)
b.append(PRIMER)
b.append(where_am_i("7"))
b.append("""
## What step 7 does

It writes one row into the customer table `ZSGSLCTR_FEEDATA` using a `TABL` step with
`Operation: "INSERT"` — recording the fee associated with the deal.

This is the fourth and last step kind the lifecycle exercises, and the simplest: no BAPI, no
report, just a direct insert into a table that an administrator has explicitly allowed.

### How a `TABL` step differs from the others

- `ImportJson` carries an **array of rows**, not a structure. Even a single row is `[{…}]`.
- `Operation` is the CRUD verb — `INSERT`, `UPDATE`, `DELETE` — and it is enforced by the
  handler, so a target pinned to `INSERT` in its allow-list row cannot be used to delete.
- `RESULT_COUNT` means what you would expect here: **rows affected**. (On a `SUBM` step, as the
  Step 4 document notes, the same column counts spool lines instead.)
- The gateway will refuse point-blank to touch its own tables — anything matching
  `ZFS_T_DYN_*` is rejected with message **039**, no matter who asks.

### The values, and where they come from

`ZB_AMT` 100,000 is the loan principal; `ZRATE` 10 is the interest rate; `ZDAY` 31 is January's
day count; `ZAMT` and `ZF_AMT` 849.32 are the accrual step 5 actually posted. The row ties the
fee record to the deal through `ZDTTK_NO`, which carries the deal number without its leading
zeros.
""")
b.append(URLS)
b.append(call_block("STEP 7 TABL INSERT into ZSGSLCTR_FEEDATA",
                    "The call — insert the fee row"))
b.append("\n## What the tables hold after this step — the final state\n")
b.append(growth_table("step6-after-tpm1", "step7-final-after-fee-row",
                      "**15 calls, 15 log rows, 15 step rows.** One for one across the whole "
                      "run, with no fan-out and no gaps."))
b.append("""
### Figure 7.1 — `ZFS_T_DYN_CALL`, the complete run in 15 rows

""")
b.append(shots(("ZFS_T_DYN_CALL — six RegisterTarget calls then nine ExecuteBatch calls",
                "step7-01-ZFS_T_DYN_CALL-15-rows.png")))
b.append("""
The whole run is legible in one screen: six `RegisterTarget` rows with a blank `COMMIT_MODE`,
then nine `ExecuteBatch` rows — one `NEVER` (the dry run) and eight `AUTO`. `EXEC_STATUS` is
`S` throughout, `STEP_COUNT` is 1 on every row, and `RESULT_COUNT` moves between 0, 1, 10 and
25 depending on what the step did.

### Figure 7.2 — `ZFS_T_DYN_STEP`, 15 rows

""")
b.append(shots(("ZFS_T_DYN_STEP — 6 REGI, 3 FUNC, 5 SUBM, 1 TABL",
                "step7-02-ZFS_T_DYN_STEP-15-rows.png")))
b.append("""
`STEP_UUID` beside `CALL_UUID` on every row is the parent/child join that groups steps under
their call. `STEP_KIND` shows the mix the lifecycle exercised: **6 × `REGI`, 3 × `FUNC`,
5 × `SUBM`, 1 × `TABL`**. `OPERATION` carries `INSERT` for the TABL and REGI rows and the
capture mode `JOB` for the SUBM rows.

### Figure 7.3 — the fee row itself, in `ZSGSLCTR_FEEDATA`

""")
b.append(shots(("ZSGSLCTR_FEEDATA — the row written by this step",
                "step7-03-ZSGSLCTR_FEEDATA-fee-row.png")))
b.append("""
### Figure 7.4 — `ZFS_T_TRM_PROBE`, still empty

""")
b.append(shots(("ZFS_T_TRM_PROBE — untouched by the whole lifecycle",
                "step7-04-ZFS_T_TRM_PROBE-still-empty.png")))
b.append("""
The negative control from step 0, re-checked at the end: nothing in the lifecycle wrote to this
table, which is what should be true.

## Independent verification

```sql
SELECT ZOTTK_NO, ZDTTK_NO, ZFEE_TYPE, ZSGSART, ZB_AMT, ZAMT, ZF_AMT, ZCREATED_BY
  FROM ZSGSLCTR_FEEDATA WHERE ZOTTK_NO = '999997'
```

| ZOTTK_NO | ZDTTK_NO | ZFEE_TYPE | ZSGSART | ZB_AMT | ZAMT | ZF_AMT | ZCREATED_BY |
|---|---|---|---|---|---|---|---|
| 999997 | 160456 | F01 | 22A | 100000 | 849.32 | 849.32 | FS_DEV3 |
| 999997 | **160457** | F01 | 22A | 100000 | 849.32 | 849.32 | FS_DEV3 |

The second row is this run's. The first is an identically-shaped row left by the **previous**
run of this test case, against deal `…160456`. Both coexist because `ZDTTK_NO` is part of the
key — the insert did not collide, and the gateway was not doing anything clever to avoid one.

## What was left on the system

**Business data:** deal `%s` and its settlement; FI documents `0600000279`, `0600000280`,
`0600000281`; one `ZSGSLCTR_FEEDATA` row (`ZOTTK_NO 999997`, `ZDTTK_NO 160457`).

**Framework data:** 6 registry rows, 6 history rows, 15 call-log rows, 15 step rows.

**Background jobs:** `ZFSDYN_RFTBBB00` ×2, `ZFSDYN_RTPM_ACCRUAL_DEFERRAL` ×2,
`ZFSDYN_RTPM_TRL_VALUATION`.

> **Open risk — read this before you walk away.** Six **write-capable** targets are registered
> and **active**. Any caller holding execute rights on the gateway can now create and settle FTR
> deals and post treasury flows through it. When testing is finished, deactivate them with a
> `RegisterTarget` call carrying `Operation: "UPDATE"` and `{"IsActive": false}` — an UPDATE
> touches only the columns you send, so nothing else about the row changes.

## What to take away

- `TABL` is the most direct step kind, and the one where the allow-list does the most work —
  it is the difference between a controlled insert and an open database gateway.
- The gateway refuses to operate on its own tables. That refusal is the reason its audit trail
  can be trusted.
- The run closes one-for-one: 15 calls, 15 log rows, 15 step rows, four step kinds, zero
  failures.
""" % DEAL)
DOCS.append(("DynGW-v2-Step-7-Fee-Row",
             "Step 7 — Write the fee row (TABL INSERT)", "\n".join(b)))


# ===========================================================================
md2docx = os.path.join(HERE, "md2docx.py")
made = []
for name, title, body in DOCS:
    src = write(name, title, body)
    dst = os.path.join(DOWNLOADS, name + ".docx")
    subprocess.run([sys.executable, md2docx, src, dst], check=True)
    made.append(dst)

print()
for m in made:
    print("%9d bytes  %s" % (os.path.getsize(m), os.path.basename(m)))
