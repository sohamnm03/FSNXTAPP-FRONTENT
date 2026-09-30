"""Split raw-calls.log into per-call and per-snapshot fragments.

The Word documents quote the real transcript rather than a retyped version of it,
so every URL, request body and response in them is the one that actually went over
the wire. This just cuts the log at its own '=' rules and files the pieces by label.
"""
import json
import os
import re
import sys

EV = r"D:\SAP Tool\SAP-Project-Development V1\worklog\DS4_100_NIIF\2026-09\evidence\2026-09-13-2026-ftr-lifecycle-v2-fresh-perstep-docs"
LOG = os.path.join(EV, "raw-calls.log")

text = open(LOG, encoding="utf-8-sig").read()
RULE = "=" * 80

blocks = []
parts = text.split(RULE)
# parts alternate: preamble, header, body, header, body, ...
i = 1
while i + 1 < len(parts) + 1 and i < len(parts):
    header = parts[i].strip()
    body = parts[i + 1] if i + 1 < len(parts) else ""
    blocks.append((header, body))
    i += 2

calls = {}
snaps = {}
for header, body in blocks:
    if header.startswith("FRAMEWORK TABLE SNAPSHOT"):
        tag = header.split("-", 1)[1].strip().split("(")[0].strip()
        snaps[tag] = body
    else:
        label = re.sub(r"\s*\(\d{4}-\d\d-\d\d .*\)$", "", header).strip()
        calls[label] = body

def call_parts(label):
    """-> (url, request_json, response_json, http)"""
    body = calls[label]
    url = re.search(r"^POST (\S+)", body, re.M).group(1)
    req = body.split("--- REQUEST BODY ---", 1)[1].split("--- RESPONSE", 1)[0].strip()
    tail = body.split("--- RESPONSE", 1)[1]
    http = re.match(r"\s*\(HTTP (\d+)\)", tail).group(1)
    resp = tail.split(")", 1)[1].strip()
    return url, req, resp, http

if __name__ == "__main__":
    print("CALLS:")
    for k in calls:
        print("   ", k)
    print("SNAPSHOTS:")
    for k in snaps:
        print("   ", k)
