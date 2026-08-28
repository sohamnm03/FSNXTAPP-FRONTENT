import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, screenInfo, clickButton,
  writeArtifact, bodyText, captureEvidence, handleKnownPopups, dumpScreen,
} from '../webgui';

/**
 * READ-ONLY probe: open an arbitrary existing deal through FTR_EDIT -> Display
 * and dump what it holds, so a later write flow can be aimed correctly.
 *
 *   $env:COMPANY_CODE="9999"; $env:DEAL_NO="100011"
 *   npx playwright test tests/probe-existing-deal.spec.ts
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;
const DISPLAY_BTN = 'M0:46:::4:8';

const COMPANY_CODE = (process.env.COMPANY_CODE ?? '').trim();
const DEAL_NO = (process.env.DEAL_NO ?? '').trim();

test.skip(!COMPANY_CODE || !DEAL_NO, 'set COMPANY_CODE and DEAL_NO to run');

test(`PROBE (read-only): FTR_EDIT display ${COMPANY_CODE}/${DEAL_NO}`, async ({ sapPage }) => {
  test.setTimeout(120_000);

  await openTransaction(sapPage, 'FTR_EDIT');
  const info = await screenInfo(sapPage);
  expect(info.system, 'must be DS4').toContain('DS4');
  expect(info.client, 'must be client 100').toContain('100');

  await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
  await setFieldVerified(sapPage, 'Financial Transaction', DEAL_NO);
  await clickButton(sapPage, DISPLAY_BTN);
  await handleKnownPopups(sapPage, SAFE_POPUP, () => {});

  const text = await bodyText(sapPage);
  writeArtifact(`probe-existing-deal-${COMPANY_CODE}-${DEAL_NO}.txt`, text);
  await captureEvidence(sapPage, `probe-existing-deal-${COMPANY_CODE}-${DEAL_NO}`);
  await dumpScreen(sapPage, `existing-deal-${COMPANY_CODE}-${DEAL_NO}`, { full: true });

  console.log(`--- screen text for ${COMPANY_CODE}/${DEAL_NO} ---`);
  console.log(text.slice(0, 3000));

  const tabs = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]')).map((t) => ({
      id: t.id, text: (t as HTMLElement).innerText.trim(),
    })),
  );
  for (const tab of tabs) {
    if (!tab.text) continue;
    await clickButton(sapPage, tab.id, 10_000).catch(() => {});
    await handleKnownPopups(sapPage, SAFE_POPUP, () => {});
    const tabText = await bodyText(sapPage);
    writeArtifact(`probe-existing-deal-${COMPANY_CODE}-${DEAL_NO}-${tab.text.replace(/\s+/g, '_')}.txt`, tabText);
    console.log(`--- tab "${tab.text}" ---`);
    console.log(tabText.slice(0, 2000));
  }
});
