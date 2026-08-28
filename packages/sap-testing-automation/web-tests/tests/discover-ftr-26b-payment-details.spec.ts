import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo,
  writeArtifact, captureEvidence, bodyText, dumpScreen, statusMessage,
  dismissLiveSearch, clickButton, selectDropdown,
} from '../webgui';
import { screenInputTitles } from '../screens';

/**
 * READ-ONLY discovery, part 5: Check (F6) now reports "No payment details
 * entered for transaction" instead of the earlier generic "Fill out all
 * required entry fields" - Structure tab is satisfied (Securities Account,
 * General Valuation Class, Number of Units, Price, Calculation/Payment Date
 * all filled). This looks at the "Payment Details" tab to see what it wants.
 *
 * WRITES NOTHING.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const COMPANY_CODE = process.env.COMPANY_CODE ?? '9990';
const CLASS_ID = process.env.CLASS_ID ?? '300021';
const PARTNER = process.env.PARTNER ?? '400000003';
const UNITS = process.env.UNITS ?? '1000';
const PRICE = process.env.PRICE ?? '100';
const TODAY = process.env.TODAY ?? '20.08.2026';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

test('DISCOVER: FTR_CREATE 26B - Payment Details tab', async ({ sapPage }) => {
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

  await selectDropdown(sapPage, 'General Valuation Class', 'Short Term').catch((e) => note(`GVC: ${e}`));
  await setField(sapPage, 'Securities Account', '1000');
  await setField(sapPage, 'Number of Units as Text', UNITS);
  await setField(sapPage, 'Security Price Without Currency Ref. with Unit Quotation', PRICE, 0);
  await setField(sapPage, 'Calculation Date', TODAY);
  await setField(sapPage, 'Payment Date', TODAY);
  await pressKey(sapPage, 'Enter');

  // ---- switch to Payment Details tab ----
  const tabs = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]'))
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ id: e.id, text: (e.textContent ?? '').trim() })),
  );
  note(`tabs: ${tabs.map((t) => t.text).join(', ')}`);
  const paymentTab = tabs.find((t) => /payment details/i.test(t.text));
  if (!paymentTab) throw new Error('Payment Details tab not found');

  await sapPage.locator(`[id="${paymentTab.id}"]`).click({ timeout: 15_000 });
  await sapPage.waitForTimeout(2000);

  const titles = await screenInputTitles(sapPage);
  note(`\n--- Payment Details tab inputs (${Object.keys(titles).length}) ---`);
  for (const t of Object.keys(titles)) note(`  "${t}"`);
  await dumpScreen(sapPage, 'ftr-26b-payment-details-tab', { full: true });
  await captureEvidence(sapPage, 'ftr-26b-payment-details-tab', 'Payment Details tab, before anything filled');

  // ---- also try Check again from here, to see if the message changed ----
  await clickButton(sapPage, 'M0:48::btn[6]');
  const msg = await statusMessage(sapPage).catch(() => '?');
  note(`\nstatus after Check on Payment Details tab: "${msg}"`);

  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|make an entry|enter a |error|consistent|payment/i.test(l));
  note(`\n--- message lines ---\n${flags.join('\n') || '(none)'}`);

  note('\nNOTHING SAVED.');
  writeArtifact('discover-ftr-26b-payment-details.txt', out.join('\n'));
});
