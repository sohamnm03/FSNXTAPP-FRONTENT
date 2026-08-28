import { defineConfig, devices } from '@playwright-sap/test';
import { sapSystem } from './sap-system';
import { BROWSER_ZOOM_ARGS, ZOOM_VIEWPORT_OPTION } from './zoom';
import { suites, testMatchFor } from './suites';

/**
 * One run id for the whole invocation, fixed here and nowhere else.
 *
 * The journal is written by the worker processes and read back by the reporter
 * in the main process, and they have to agree on the filename. Letting each
 * side default it independently means two different ids and a reporter that
 * finds no journal - so it is settled at config load, before any worker is
 * forked, and inherited from this process by all of them.
 *
 * scripts/run-case.ps1 sets it beforehand so it knows the id in advance; this
 * only fills in for a bare `npx playwright test`.
 */
if (!process.env.SAP_RUN_ID) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  process.env.SAP_RUN_ID =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-` +
    `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/**
 * Fiori / WebGUI / UI5 test lane.
 *
 * Target system, endpoints and credentials all come from
 * ../config/sap-systems.json via ./sap-system.ts - do not hardcode a URL here.
 * See docs/web-testing-setup.md.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: '../results/web/test-output',

  // SAP screens are slow. These are deliberately generous, not accidental.
  timeout: 90_000,
  expect: { timeout: 20_000 },

  // A failing SAP test is almost never fixed by running it again - a retry just
  // hides a real timing bug. Keep this at 0 until a case proves otherwise.
  retries: 0,

  // Sequential by default: shared test data on one client makes parallel runs
  // interfere. Raise once cases are proven independent.
  workers: 1,
  fullyParallel: false,

  // Refuse to run a suite that still has test.only in it.
  forbidOnly: !!process.env.CI,

  // The run writes its own record. `result-file` renders results/TC-*.md from
  // what the run observed - the file the dashboard reads, the freeze gate
  // counts and the case's Run history cites. It used to be transcribed by hand
  // after the fact, which is the one step in this lane that still needed a
  // person present. See docs/unattended-runs.md.
  reporter: [
    ['list'],
    ['html', { outputFolder: '../results/web/html-report', open: 'never' }],
    ['./reporters/result-file.ts'],
  ],

  use: {
    baseURL: sapSystem.baseUrl,
    ignoreHTTPSErrors: sapSystem.ignoreHttpsErrors,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,

    // ALWAYS VISIBLE. Every run opens a real browser window that the human can
    // watch - this lane is never run headless. A headless SAP run that "passes"
    // is unreviewable, and this app has already shown it can report success
    // while writing nothing (see TC-001 defect D1).
    //
    // SAP_SLOWMO paces the actions so they can be followed by eye; raise it to
    // slow a demo down, but do not set headless back to true.
    headless: false,
    launchOptions: {
      slowMo: Number(process.env.SAP_SLOWMO ?? 250),
      // Maximized window + browser-level zoom (SAP_ZOOM, default 90%) so a
      // whole SAP screen fits the window. Must be paired with `viewport: null`
      // below. See zoom.ts.
      args: BROWSER_ZOOM_ARGS,
    },

    // Evidence on failure only - traces and videos of passing runs are noise.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // SAP screens are laid out for a desktop; a small viewport changes which
    // controls render and produces failures that are not product bugs.
    //
    // Always `null`: the page takes the real (maximized) window, which is what
    // lets --start-maximized and --force-device-scale-factor apply. See zoom.ts.
    viewport: ZOOM_VIEWPORT_OPTION,
  },

  // Logon is handled by the worker-scoped `sapContext` fixture in ./fixtures.ts,
  // not by a setup project writing storageState - SAP logs the user off on page
  // unload, so a saved session is dead before the next project starts. See the
  // comment block in fixtures.ts.
  //
  // One project per suite, from ../config/suites.json - so `--project=regression`
  // is exactly the case-backed set and cannot accidentally include a discovery
  // spec. Every spec on disk belongs to exactly one suite; ./suites.ts refuses to
  // load if one is unclassified or claimed twice.
  projects: suites.map((s) => ({
    name: s.name,
    testMatch: testMatchFor(s.name),
    // devices['Desktop Chrome'] carries its own viewport (1280x720) and
    // deviceScaleFactor, and project `use` wins over the block above - so the
    // zoom settings are re-applied after the spread, not before.
    use: {
      ...devices['Desktop Chrome'],
      viewport: ZOOM_VIEWPORT_OPTION,
      deviceScaleFactor: undefined,
    },
  })),
});
