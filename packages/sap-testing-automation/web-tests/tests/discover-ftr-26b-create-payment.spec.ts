import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo,
  writeArtifact, captureEvidence, dismissLiveSearch, clickButton, selectDropdown,
  statusMessage, readField, bodyText, dumpScreen, readPopup,
} from '../webgui';
import { screenInputTitles } from '../screens';

/**
 * READ-ONLY discovery: what does "Create New Payment Details"
 * (id M0:46:2:3B268:1::13:34, in the Payment Details table's own toolbar)
 * open? This is the real action behind "No payment details entered for
 * transaction" - Payer/Payee alone (already filled) was not enough
 * (discover-ftr-26b-payer-payee.spec.ts).
 *
 * WRITES NOTHING.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const COMPANY_CODE = process.env.COMPANY_CODE ?? '9990';
const CLASS_ID = process.env.CLASS_ID ?? '300025';
const PARTNER = process.env.PARTNER ?? '400000003';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

test('DISCOVER: Create New Payment Details button', async ({ sapPage }) => {
  test.setTimeout(300_000);

  await openTransaction(sapPage, 'FTR_CREATE');
  const session = await screenInfo(sapPage);
  expect(session.system).toContain('DS4');
  expect(session.client).toContain('100');

  await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });
  await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Product Type', '26B');
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Financial Transaction Type', '100');
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Security Class ID Number', CLASS_ID);
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Business Partner Number', PARTNER);
  await dismissLiveSearch(sapPage);
  await pressKey(sapPage, 'Enter');

  const info = await screenInfo(sapPage);
  if (!info.screen?.includes('SAPLTTM_UI_FRAMEWORK')) {
    throw new Error(`did not reach the deal screen - landed on ${info.screen}`);
  }

  const positionValueDate = await readField(sapPage, 'Position Value Date').catch(() => '');
  await selectDropdown(sapPage, 'General Valuation Class', 'Short Term');
  await setField(sapPage, 'Securities Account', '1000');
  await setField(sapPage, 'Number of Units as Text', '1000');
  await setField(sapPage, 'Security Price Without Currency Ref. with Unit Quotation', '100', 0);
  await setField(sapPage, 'Calculation Date', positionValueDate);
  await setField(sapPage, 'Payment Date', positionValueDate);
  await pressKey(sapPage, 'Enter');

  const tabs = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]'))
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ id: e.id, text: (e.textContent ?? '').trim() })),
  );
  const paymentTab = tabs.find((t) => /payment details/i.test(t.text));
  if (!paymentTab) throw new Error('Payment Details tab not found');
  await sapPage.locator(`[id="${paymentTab.id}"]`).click({ timeout: 15_000 });
  await sapPage.waitForTimeout(1500);

  await setField(sapPage, 'Payer/Payee', PARTNER);
  await pressKey(sapPage, 'Enter');

  // ---- click "Create New Payment Details" ----
  const btnId = 'M0:46:2:3B268:1::13:34';
  const btnPresent = await sapPage.locator(`[id="${btnId}"]`).count();
  note(`"Create New Payment Details" button present: ${btnPresent > 0}`);
  if (btnPresent > 0) {
    await clickButton(sapPage, btnId);
    await sapPage.waitForTimeout(1500);

    const popup = await readPopup(sapPage).catch(() => null);
    if (popup) note(`\npopup: ${JSON.stringify(popup).slice(0, 2000)}`);

    const info2 = await screenInfo(sapPage);
    note(`\nscreen after click: ${JSON.stringify(info2)}`);
    await dumpScreen(sapPage, 'ftr-26b-create-payment-details', { full: true });
    await captureEvidence(sapPage, 'ftr-26b-create-payment-details', 'after Create New Payment Details');

    const titles = await screenInputTitles(sapPage);
    note(`\n--- inputs now on screen (${Object.keys(titles).length}) ---`);
    for (const t of Object.keys(titles)) note(`  "${t}"`);
  }

  note('\nNOTHING SAVED.');
  writeArtifact('discover-ftr-26b-create-payment.txt', out.join('\n'));
});
