#!/usr/bin/env python3
"""Local static-file server + OData proxy for the ICL console.

Serves four static screens from this one directory on http://localhost:<port>/:
    index.html            -- hub linking to the four screens below
    create-request.html   -- Create ICL Request (OTTK selection -> deposit calc -> ICL request)
    deposit-create.html   -- Create Deposit (company code / key date dashboard)
    alloc-bank.html        -- View Pending ICL Requests & Allocate Bank
    approve-reject.html   -- View & Approve ICL Request (incl. DMS documents)

None of the four screens call an OData service yet -- each one runs entirely on its own
in-page sample data (the same "HAS_EXTERNAL_PAYLOAD ? ... : DEFAULT_DATA" pattern used by
every other console in web/). That is deliberate: the ICL OData layer has not been built,
so this proxy does not invent one. The /api/* passthrough below forwards to the five
existing services only (ottk/dttk/dealid/tf/dyngw) for parity with the rest of the family;
wiring an ICL-specific route in here is future work once that service exists.

approve-reject.html previously ran inside an ABAP HTML viewer control: it posted
"SAPEVENT:..." forms and read its initial data from a "__SAP_PAYLOAD__" script-tag
placeholder that only worked when a report string-replaced it before displaying the
control. That mechanism has been removed permanently (see lessons-ledger.md) -- the page
now runs standalone in a browser like its three siblings, injecting an
"ICL_APPROVE_REQUESTS_PAYLOAD" global variable if a future OData/report layer wants to
seed it, and running on its own sample data otherwise.

Non-secret settings live in sap_config.json next to this file. The
password is never stored here: it comes from the environment variable
named by sap_config.json's "passwordEnvVar", or -- if that is unset --
from the repo's gitignored .claude/settings.local.json "env" block.

Run:  python web/icl-console/proxy.py
"""
import json
import os
import ssl
import http.cookiejar
import urllib.request
import urllib.error
from base64 import b64encode
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Repo root = the nearest ancestor holding .claude/ -- found by search rather than by a
# fixed depth, because this console moved from web/<name>/ to web/<group>/<name>/ on
# 2026-09-15 and a hard-coded parents[n] breaks silently on the next such move (L-528).
REPO_ROOT = next((p for p in HERE.parents if (p / ".claude").is_dir()), HERE.parents[-1])
CONFIG = json.loads((HERE / "sap_config.json").read_text(encoding="utf-8-sig"))
SERVICES = CONFIG["services"]


def _resolve_password():
    var = CONFIG["passwordEnvVar"]
    value = os.environ.get(var)
    if value:
        return value
    settings = REPO_ROOT / ".claude" / "settings.local.json"
    if settings.is_file():
        # utf-8-sig: this file is written with a BOM by the sync script.
        env = json.loads(settings.read_text(encoding="utf-8-sig")).get("env", {})
        if env.get(var):
            return env[var]
    raise SystemExit(
        f"No password found. Set the {var} environment variable, or add it to the\n"
        f"'env' block of {settings}."
    )


AUTH_HEADER = "Basic " + b64encode(
    f"{CONFIG['user']}:{_resolve_password()}".encode("utf-8")
).decode("ascii")

SSL_CTX = ssl.create_default_context()
if not CONFIG.get("tlsVerify", True):
    SSL_CTX.check_hostname = False
    SSL_CTX.verify_mode = ssl.CERT_NONE

# One cookie jar + CSRF token cached per service key, created on that key's first
# call -- an unused route costs nothing.
_sessions = {}


def _session(key):
    if key not in _sessions:
        _sessions[key] = {"jar": http.cookiejar.CookieJar(), "token": None}
    return _sessions[key]


def _opener(jar):
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=SSL_CTX),
    )


def _service_url(key, path, query):
    base = SERVICES[key]["base"].rstrip("/")
    client = SERVICES[key]["client"]
    qs = f"{query}&sap-client={client}" if query else f"sap-client={client}"
    return f"{base}/{path.lstrip('/')}?{qs}"


def _fetch_token(key):
    sess = _session(key)
    req = urllib.request.Request(_service_url(key, "", ""))
    req.add_header("Authorization", AUTH_HEADER)
    req.add_header("X-CSRF-Token", "Fetch")
    try:
        resp = _opener(sess["jar"]).open(req, timeout=30)
        token = resp.headers.get("x-csrf-token")
    except urllib.error.HTTPError as exc:
        token = exc.headers.get("x-csrf-token")
    sess["token"] = token
    return token


def proxy_request(key, method, path, query, body, content_type):
    sess = _session(key)
    url = _service_url(key, path, query)
    needs_token = method in ("POST", "PATCH", "PUT", "DELETE")
    if needs_token and not sess["token"]:
        _fetch_token(key)

    def attempt():
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Authorization", AUTH_HEADER)
        req.add_header("Accept", "application/json")
        if content_type:
            req.add_header("Content-Type", content_type)
        if needs_token and sess["token"]:
            req.add_header("X-CSRF-Token", sess["token"])
        return _opener(sess["jar"]).open(req, timeout=30)

    try:
        resp = attempt()
        return resp.status, dict(resp.getheaders()), resp.read()
    except urllib.error.HTTPError as exc:
        if needs_token and exc.code == 403:
            _fetch_token(key)
            try:
                resp = attempt()
                return resp.status, dict(resp.getheaders()), resp.read()
            except urllib.error.HTTPError as exc2:
                return exc2.code, dict(exc2.headers.items()), exc2.read()
        return exc.code, dict(exc.headers.items()), exc.read()
    except Exception as exc:  # network/TLS failure reaching SAP
        payload = json.dumps({"error": {"message": {"value": str(exc)}}}).encode("utf-8")
        return 502, {"Content-Type": "application/json"}, payload


class Handler(BaseHTTPRequestHandler):
    # HTTP/1.1 so the browser reuses connections instead of burning a socket per request
    # (see L-278 in lessons/lessons-ledger.md). Every response below sends an accurate
    # Content-Length, which is what makes keep-alive safe.
    protocol_version = "HTTP/1.1"
    # Keep-alive connections each hold a worker thread, so don't let an idle one hold it forever.
    timeout = 30

    def _serve_static(self):
        rel = self.path.split("?", 1)[0].lstrip("/") or CONFIG["indexFile"]
        candidate = (HERE / rel).resolve()
        if candidate != HERE and HERE not in candidate.parents:
            candidate = HERE / CONFIG["indexFile"]
        if not candidate.is_file():
            candidate = HERE / CONFIG["indexFile"]
        data = candidate.read_bytes()
        ctype = "text/html; charset=utf-8" if candidate.suffix in (".html", ".htm") else "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        # Every screen here is edited constantly during development. Without this, the
        # browser happily keeps running a cached older build, which looks exactly like a
        # broken feature (L-264).
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(data)

    def _serve_whoami(self):
        payload = json.dumps({
            "systemId": CONFIG["systemId"],
            "client": SERVICES["tf"]["client"],
            "user": CONFIG["user"],
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _handle_api(self, method):
        if self.path.split("?", 1)[0] == "/api/whoami":
            if method != "GET":
                self.send_error(405, "whoami is read-only")
                return
            self._serve_whoami()
            return
        route_and_query = self.path[len("/api/"):].split("?", 1)
        route = route_and_query[0]
        query = route_and_query[1] if len(route_and_query) > 1 else ""
        key, _, rest = route.partition("/")
        if key not in SERVICES:
            self.send_error(404, "Unknown service (use /api/ottk/..., /api/dttk/..., /api/dealid/..., /api/tf/..., /api/dyngw/... or /api/whoami)")
            return
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        content_type = self.headers.get("Content-Type")
        status, headers, data = proxy_request(key, method, rest, query, body, content_type)
        self.send_response(status)
        self.send_header("Content-Type", headers.get("Content-Type", "application/json"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if data:
            self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._handle_api("GET")
        else:
            self._serve_static()

    def do_POST(self):
        self._handle_api("POST")

    def do_PATCH(self):
        self._handle_api("PATCH")

    def do_DELETE(self):
        self._handle_api("DELETE")

    def log_message(self, fmt, *args):
        print("[proxy]", fmt % args)


if __name__ == "__main__":
    port = CONFIG.get("port", 8772)
    print(f"{CONFIG['systemId']} - serving {CONFIG['indexFile']} + OData proxy")
    print(f"Open http://localhost:{port}/   (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
