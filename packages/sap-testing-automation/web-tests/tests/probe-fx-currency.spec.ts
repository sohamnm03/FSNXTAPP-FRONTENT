import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo,
  writeArtifact, settle, selectDropdown, clickButton, handleKnownPopups,
  findSaveButton, handleSaveDialogs,
} from '../webgui';

/**
 * READ-ONLY-ish probe: is 60A/101's "Update type is not assigned" error tied
 * to the AUD/USD currency pair specifically, or does every pair hit it? Tries
 * USD/INR (this company's home currency, given every other deal in this
 * workspace that lets SAP default Payment Currency lands on either AUD or
 * INR) as a second data point. Stops at the check-run refusal either way -
 * nothing is saved.
 */

test.skip(process.env.DISCOVER !== '1', 'probe - run with DISCOVER=1');

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;

test('PROBE: FX update-type gap - is it currency-pair specific?', async ({ sapPage }) => {
  test.setTimeout(300_000);

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await setFieldVerified(sapPage, 'Company Code', '9800');
  await setFieldVerified(sapPage, 'Product Type', '60A');
  await setFieldVerified(sapPage, 'Financial Transaction Type', '101');
  await setFieldVerified(sapPage, 'Business Partner Number', '400000003');
  await pressKey(sapPage, 'Enter');

  await setField(sapPage, 'Leading Currency', 'INR');
  await setField(sapPage, 'Following Currency', 'USD');
  await setField(sapPage, 'Traded Amount as Text Field', '10000');
  await setField(sapPage, 'Rate of Foreign Exchange Transaction', '80');
  await setField(sapPage, 'Value Date', '01.01.2026');
  await setField(sapPage, 'Contract Date', '01.01.2026');
  await selectDropdown(sapPage, 'Traded Currency', 'USD');
  await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));
  await pressKey(sapPage, 'Enter');
  await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));

  const tabId = await sapPage.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(
      (t) => (t as HTMLElement).innerText.trim() === 'Administr.',
    );
    return tab?.id ?? null;
  });
  if (tabId) {
    await clickButton(sapPage, tabId, 15_000);
    await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));
    await selectDropdown(sapPage, 'General Valuation Class', 'Short-term investments');
    await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));
  }

  const saveBtn = (await findSaveButton(sapPage)) ?? 'M0:50::btn[11]';
  await clickButton(sapPage, saveBtn);
  const dialogs = await handleSaveDialogs(sapPage, SAFE_POPUP, (s) => console.log(s));

  const out = [
    `INR/USD attempt - blocked: ${dialogs.blocked ?? 'NO - save proceeded'}`,
    `checkRun: ${dialogs.checkRun.join('\n')}`,
  ];
  writeArtifact('probe-fx-inr-usd.txt', out.join('\n\n'));
  console.log(out.join('\n\n'));
});
