# Web Test Lane (`playwright-sap`)

Fiori, WebGUI and UI5 testing — the half of SAP the SAP GUI Scripting lane
cannot reach. Lives in `web-tests/`.

- Upstream: <https://github.com/ArpitSureka/playwright-sap>, docs at <https://playwright-sap.dev/>
- Packages: `@playwright-sap/test` **1.1.6** (test runner), `playwright-sap` /
  `playwright-sap-core` (aliased in `node_modules` as `playwright` /
  `playwright-core`)
- Apache-2.0, Node ≥ 18 (running Node 24.14.1 here)
- Browser: Chromium 138.0.7204.23, Playwright build v1179

## What it is

A **fork of Playwright**, not a plugin on top of it. `npm ls` shows `playwright`
and `playwright-core`, but both are aliases for `playwright-sap@1.1.6`. The
whole Playwright API is there and behaves as documented upstream; the fork adds
SAP-aware locators and a login helper.

Two consequences worth knowing up front:

- **Version numbers are the fork's own.** `1.1.6` is not upstream Playwright
  1.1.6. The bundled Chromium (138 / build 1179) puts the base at roughly
  upstream Playwright 1.53, mid-2025.
- **Browser and security updates arrive when the fork maintainer rebases.** This
  is a 12-star single-maintainer project. That is fine for a dev-system test
  lane; do not build anything on it that needs a patched browser on a schedule.

If the fork ever stalls, the exit is cheap: the specs are ordinary Playwright,
so the only things to replace are `SAPLogin`, `getByRoleUI5` and `locateUI5`.

## The SAP-specific API

Three additions over stock Playwright, all on `page`:

| API | Purpose |
|---|---|
| `page.SAPLogin(user, password, url?)` | Opens the URL and fills the SAP logon form |
| `page.getByRoleUI5(role, properties?, options?)` | Locate a UI5 control by its control type and properties — e.g. `getByRoleUI5('Item', { text: 'Samples' })`, `getByRoleUI5('Dialog', { title: 'Confirmation' })` |
| `page.locateUI5(xpath)` | UI5-aware XPath, for when the control tree needs walking |

Everything else — `expect`, fixtures, traces, codegen, the runner — is
Playwright as documented at playwright.dev.

`getByRoleUI5` is the one that earns the fork. It matches on the UI5 control
tree rather than rendered DOM, so it survives the div-soup that UI5 regenerates
between releases. Reach for it before falling back to CSS or XPath.

## Layout

```
web-tests/
  package.json           scripts: test, test:headed, test:ui, codegen, report
  playwright.config.ts   timeouts, reporters, projects. Reads the registry.
  sap-system.ts          resolves the target system + credentials
  fixtures.ts            worker-scoped logged-in context (see below)
  tsconfig.json
  .env.example           copy to .env only when running outside Claude Code
  tests/
    smoke.spec.ts        plumbing checks - logon, both entry points render
```

Output goes to `results/web/` (html report and per-test artifacts), which is
gitignored along with everything else that touches live data.

## Configuration and credentials

There is **no URL or password in any file under `web-tests/`.** The target comes
from `config/sap-systems.json` — the same registry the SAP GUI lane uses — read
by `sap-system.ts`:

```json
"web": {
  "enabled": true,
  "baseUrl": "https://vhnlqds4ap01.sap.niififl.in:44300",
  "flpPath": "/sap/bc/ui2/flp?sap-client=100",
  "webguiPath": "/sap/bc/gui/sap/its/webgui?sap-client=100",
  "ignoreHttpsErrors": false
}
```

The password is resolved from the env var the registry names
(`SAP_DS4_100_NIIF_PASSWORD`), which inside Claude Code already comes from the
`env` block of `.claude/settings.local.json`. One secret, one place, both lanes.

`sap-system.ts` refuses to run if:

- the system id is unknown, disabled, or has no enabled `web` block;
- the password env var is unset — with a message telling you where to put it;
- the resolved base URL looks like production (`prd`, `ps4`, `prod`). That is a
  hard throw, not a warning, and it also catches a `SAP_BASE_URL` override.

Overrides, both optional: `SAP_SYSTEM_ID` picks a different registered system,
`SAP_BASE_URL` overrides the URL.

### Running outside Claude Code

`.claude/settings.local.json` is only read by Claude Code. From a plain
terminal, copy `.env.example` to `web-tests/.env` and put the password there —
`sap-system.ts` loads it with dotenv. `.env` is gitignored.

## Logon: why there is no `storageState`

The standard Playwright pattern is a setup project that logs in once, saves
`storageState`, and lets every other project restore it. **That does not work
against SAP**, and it fails in a way that wastes an afternoon if you don't know
it: both the Fiori launchpad and the ITS WebGUI register unload handlers that
log the user off when the page goes away. The saved cookies are syntactically
perfect and completely dead.

Measured on DS4 while building this lane:

| Scenario | Result |
|---|---|
| Restore state into a new context, original still open | works |
| Restore state into a new context, original context closed | works |
| Restore state in a new **browser**, after the first browser exited | **logon screen** |

So `fixtures.ts` uses a **worker-scoped context** instead. Each worker logs in
once, keeps the logged-in context (and its login page) open for its whole life,
and hands each test a fresh page inside it. Nothing has to survive a teardown.
Cost: one logon per worker rather than one per run — with `workers: 1`, that is
one logon per suite.

Write specs against the `sapPage` fixture, not the built-in `page`:

```ts
import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';

test('material displays', async ({ sapPage }) => {
  await sapPage.goto(sapSystem.webguiUrl, { waitUntil: 'domcontentloaded' });
  await expect(sapPage.getByText(/SAP Easy Access/i).first()).toBeVisible();
});
```

## Assertion order — the trap that looks like a pass

Assert something is **present** before asserting something is **absent**.

```ts
// WRONG - passes on a blank page, before the logon form has rendered
await expect(page.locator('input[type="password"]')).toHaveCount(0);

// RIGHT - prove the page rendered, then prove we are past the logon
await expect(page.locator('#shell, .sapUiBody, #canvas').first()).toBeVisible();
await expect(page.locator('input[type="password"]')).toHaveCount(0);
```

This is the web twin of L-213 in the GUI lane: `sap_connect` returning `ok` is
not proof of a logon either. Absence proves nothing until presence is
established.

## Running

```bash
npm test --prefix web-tests
```

**This lane never runs headless.** `playwright.config.ts` sets `headless: false`
and a default `slowMo` of 250 ms, so every run — including plain `npm test` —
opens a real browser window you can watch drive the SAP UI. Do not set
`headless: true` or pass `--headless`. Pace a run with `SAP_SLOWMO`:

```powershell
$env:SAP_SLOWMO="600"; npm test --prefix web-tests
```

**The browser opens maximized, at 90% zoom** so the whole SAP screen is visible
in the window. The window always fills the screen (`--start-maximized`); the
zoom lays out ~1/0.9 as many CSS px inside it, which is what a wide WebGUI
screen or ALV grid needs before the right-hand columns come into view.

It is browser-level zoom — `--force-device-scale-factor` with the window
maximized, and viewport emulation off (`viewport: null`). All of it lives in
`web-tests/zoom.ts`; both the config and the `sapContext` fixture read from
there, and the two must stay paired: an emulated viewport silently cancels the
launch flag (measured — `devicePixelRatio` stays at 1.0). A fixed `--window-size`
was tried first and dropped — it fights `--start-maximized` and left the window
smaller than the screen, reading as "minimised" to a human watching.

> **Do not zoom the document instead.** Setting
> `document.documentElement.style.zoom` reflows the top document correctly and
> its clicks land, but Playwright's click point for an element inside a **child
> iframe** is computed through the zoomed parent and lands short. It broke TC-001
> at its first form field — every click on `#i-cocode` was intercepted by the
> field's `<label>` — while the same click succeeded with zoom off. `zoom.ts`
> records this; the browser-level route has no such effect because the scaling
> happens below the layer Playwright addresses.

Change or disable the zoom with `SAP_ZOOM`:

```powershell
$env:SAP_ZOOM="0.67"; npm test --prefix web-tests   # smaller still
$env:SAP_ZOOM="1"; npm test --prefix web-tests      # off
```

| Command | Does |
|---|---|
| `npm test --prefix web-tests` | Visible run, list + HTML reporter |
| `npm run test:headed --prefix web-tests` | Same thing — `--headed` is now redundant |
| `npm run test:ui --prefix web-tests` | Playwright UI mode — time-travel debugging |
| `npm run codegen --prefix web-tests` | Record a flow; emits SAP-aware selectors |
| `npm run report --prefix web-tests` | Open the last HTML report |

Config choices worth knowing, all in `playwright.config.ts`:

- `timeout: 90s`, `navigationTimeout: 60s` — SAP screens are slow; these are
  deliberate, not accidental.
- `retries: 0` — a retry on an SAP test usually hides a real timing bug rather
  than fixing a flake. Raise only for a case that has earned it.
- `workers: 1`, `fullyParallel: false` — shared test data on one client makes
  parallel runs interfere. Raise once cases are proven independent.
- `trace`/`video`/`screenshot` on failure only.

## Driving classic Dynpro in WebGUI (`webgui.ts`)

`web-tests/webgui.ts` holds the helpers for ITS-rendered Dynpro transactions
(FTR_CREATE, FTR_EDIT, TBB1 …). Three things it exists to encode:

- **Address fields by `title`, never by id.** ITS ids are positional
  (`M0:46:2:3B256:3::0:10`) and move between screens and round trips. Every
  input carries its screen label in `title`, which is stable: `field(page, 'Term Start')`.
- **Popups are the `M1:` window.** There is no `wnd[1]` here — a control with an
  `M1:` id prefix *is* the modal. `handleKnownPopups` confirms only dialogs
  matching a caller-supplied pattern and hard-fails on anything else, so a write
  never clicks through a dialog nobody vetted.
- **Buttons need escalating clicks.** ITS renders them as `<div role="button">`
  that Playwright often reports as not actionable. `clickButton` tries a normal
  click, then force, then a real mouse down/up at the element centre.
- **Waits are adaptive, never fixed.** `settle()` returns when no HTTP request is
  in flight *and* the DOM has stopped changing for two samples. Both conditions
  matter: the request check stops it declaring success in the gap after a click
  but before SAP replies, when the DOM is trivially "stable" because nothing has
  happened yet. Pass a `maxMs` cap only to bound a step, not to pace it.

  SAP answers these screens in 200–800 ms (its own `E2E Time` readout), so the
  old flat 3–6 s sleeps wasted ~100 s over a 30-step flow and were still a guess
  a slow screen could outrun. Measured after the change: 594 ms on a static
  screen, ~370 ms after a repaint stops, and a clean give-up at `maxMs`.
  `tests/settle-unit.spec.ts` pins all three **offline** - it needs no VPN, so
  the helper stays checkable when DS4 is unreachable.

### Discovery vs regression

A raw screen dump is ~12 KB, nearly all of it identical accessibility
boilerplate, menu bar, and icon-only toolbar buttons. Reading a handful costs
more context than the test itself. So dumping is off by default:

| Mode | Command | Emits |
|---|---|---|
| Regression (default) | `npm test --prefix web-tests` | nothing to read on a green run |
| Discovery | `$env:DISCOVER="1"` | lean dumps (~2.8 KB/screen) + screenshots |
| Failure | automatic | a **full** dump, via `dumpOnFailure` in `afterEach` |

Lean dumps drop the boilerplate and print compact lines — `"Term Start" = "01.01.2026"`
for inputs, `[btn] Save -> M0:50::btn[11]` for actions. Use `{ full: true }`
only when a screen is genuinely misbehaving.

Parse values off a screen with `bodyText(page)`, not the dump — the dump is
truncated for reading, `bodyText` is not.

## Which lane for which test

| Testing this | Lane |
|---|---|
| A classic Dynpro transaction in SAP GUI (VA01, MM03, ME21N) | `sap-gui` MCP server |
| ALV grid or table control in SAP GUI | `sap-gui` MCP server |
| Fiori app, launchpad tile, UI5 control | `web-tests` |
| WebGUI (the same transaction in a browser) | `web-tests` |
| A flow that spans both | Split it; note the boundary in the case file |

A transaction reachable in both SAP GUI and WebGUI is worth testing in the lane
your users actually use. They are not the same rendering path and they do not
fail the same way.

## Verification (2026-08-16)

```
npm install                3 packages
playwright install         Chromium 138.0.7204.23 (build v1179)
npm test                   3 passed (12.3s)
                           - Fiori launchpad loads for the logged-in user
                           - WebGUI reaches the SAP Easy Access screen
                           - system identity is DS4 / client 100
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Password not found. Set SAP_…` | Env var unset — Claude Code not restarted, or no `web-tests/.env` outside it |
| `Refusing to run: base URL … looks like production` | `SAP_BASE_URL` or a registry entry points at PS4. Intended behaviour. |
| Every spec lands on the logon screen | Session died — check you're using the `sapPage` fixture, not the raw `page` |
| Assertion passes but the page is clearly wrong | Absence-only assertion; assert presence first |
| `certificate` errors | Import the CA. Do not set `ignoreHttpsErrors: true` to make it go away. |
| UI5 control not found | Use `getByRoleUI5` with the control type, not a CSS class — UI5 regenerates DOM between releases |
| Browser missing after a clone | `npm run install-browsers --prefix web-tests` |
