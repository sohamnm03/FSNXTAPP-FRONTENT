import { test as base, expect, type BrowserContext, type Page } from '@playwright-sap/test';
import { sapSystem } from './sap-system';
import { ZOOM_VIEWPORT_OPTION } from './zoom';

/**
 * One SAP logon per worker, shared by every test that worker runs.
 *
 * Why not the usual `storageState` setup-project pattern? Because SAP kills the
 * session behind your back. Both the Fiori launchpad and the ITS WebGUI
 * register unload handlers that log the user off when the page goes away, so
 * the session a setup project saves is dead by the time the next project's
 * browser starts. Measured on DS4: cookies restore fine into a context created
 * while the original was still open, and land on the logon screen once the
 * original browser has closed.
 *
 * A worker-scoped context sidesteps it: the logged-in context stays open for
 * the worker's entire life, so nothing ever has to survive a teardown. The
 * cost is one logon per worker instead of one per run.
 */

type WorkerFixtures = {
  /** Logged-in browser context, alive for the whole worker. */
  sapContext: BrowserContext;
};

type TestFixtures = {
  /** Fresh page in the logged-in context. Use this instead of `page`. */
  sapPage: Page;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  sapContext: [
    async ({ browser }, use) => {
      // viewport comes from ./zoom: always null, so the page inherits the real
      // maximized, browser-zoomed window instead of an emulated viewport that
      // would cancel the zoom out. See zoom.ts.
      const context = await browser.newContext({
        viewport: ZOOM_VIEWPORT_OPTION,
        ignoreHTTPSErrors: sapSystem.ignoreHttpsErrors,
      });

      const loginPage = await context.newPage();
      await loginPage.SAPLogin(sapSystem.user, sapSystem.password, sapSystem.flpUrl);

      // Prove the logon landed before any test runs.
      //
      // Order matters: assert something is PRESENT first. "No password box" is
      // trivially true of a page that has not rendered yet, so on its own it
      // passes before the logon form has even appeared - the web equivalent of
      // trusting sap_connect's `ok` in the SAP GUI lane.
      await loginPage.goto(sapSystem.flpUrl, { waitUntil: 'domcontentloaded' });
      await expect(
        loginPage.locator('#shell, .sapUiBody, #canvas').first(),
      ).toBeVisible({ timeout: 60_000 });
      await expect(loginPage.locator('input[type="password"]')).toHaveCount(0);

      // Deliberately left open: closing it would fire the launchpad's
      // logoff-on-unload and take the whole session with it.
      await use(context);

      await context.close();
    },
    { scope: 'worker' },
  ],

  sapPage: async ({ sapContext }, use) => {
    const page = await sapContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };
