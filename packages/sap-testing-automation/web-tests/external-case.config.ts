import { defineConfig, devices } from '@playwright-sap/test';
import { sapSystem } from './sap-system';
import { BROWSER_ZOOM_ARGS, ZOOM_VIEWPORT_OPTION } from './zoom';

/** Runs the one saved case.spec.ts the desktop copied into FSNXT_EXTERNAL_RUN_DIR. */
export default defineConfig({
  testDir: process.env.FSNXT_EXTERNAL_RUN_DIR ?? '.',
  testMatch: 'case.spec.ts',
  outputDir: '../results/web/test-output',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: sapSystem.baseUrl,
    ignoreHTTPSErrors: sapSystem.ignoreHttpsErrors,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    headless: false,
    launchOptions: { slowMo: Number(process.env.SAP_SLOWMO ?? 250), args: BROWSER_ZOOM_ARGS },
    viewport: ZOOM_VIEWPORT_OPTION,
    deviceScaleFactor: undefined,
  },
});
