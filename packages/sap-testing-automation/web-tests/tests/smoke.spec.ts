import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';

/**
 * Smoke checks. These prove the plumbing works - logon, session reuse, both
 * entry points render - and nothing about business logic.
 *
 * Real cases go in their own spec files, one per test case, mirroring the
 * markdown case in ../../test-cases/Web-TC/. See docs/test-authoring-guide.md.
 *
 * Note the assertion order everywhere below: assert something is PRESENT
 * first, then assert the password box is absent. "No password box" alone is
 * true of a blank page and passes before anything has rendered.
 */

test.describe('SAP web entry points', () => {
  test('Fiori launchpad loads for the logged-in user', async ({ sapPage }) => {
    await sapPage.goto(sapSystem.flpUrl, { waitUntil: 'domcontentloaded' });

    await expect(sapPage.locator('#shell, .sapUiBody, #canvas').first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  });

  test('WebGUI opens and reaches the SAP Easy Access screen', async ({ sapPage }) => {
    await sapPage.goto(sapSystem.webguiUrl, { waitUntil: 'domcontentloaded' });

    await expect(sapPage.getByText(/SAP Easy Access/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  });
});

test.describe('system identity', () => {
  test('is the system the registry says it is', async ({ sapPage }) => {
    // Non-negotiable #1: confirm which system is being driven before trusting
    // anything else.
    await sapPage.goto(sapSystem.webguiUrl, { waitUntil: 'domcontentloaded' });
    expect(sapPage.url()).toContain(`sap-client=${sapSystem.client}`);
    expect(sapSystem.baseUrl).toContain('vhnlqds4ap01');
  });
});
