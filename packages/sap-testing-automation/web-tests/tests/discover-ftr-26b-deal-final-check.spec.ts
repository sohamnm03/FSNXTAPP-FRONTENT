import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo,
  writeArtifact, captureEvidence, bodyText, dumpScreen, statusMessage,
  dismissLiveSearch, clickButton, selectDropdown, readField, field,
} from '../webgui';

/**
 * READ-ONLY discovery, part 6: with every Structure-tab field filled
 * (Securities Account 1000, General Valuation Class Short Term, Number of
 * Units, Price, Calculation/Payment Date), is "No payment details entered
 * for transaction" the ONLY remaining message from Check (F6), confirming
 * this deal is otherwise ready to save?
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

test('DISCOVER: FTR_CREATE 26B - final Check from Structure tab, fully filled', async ({ sapPage }) => {
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

  await selectDropdown(sapPage, 'General Valuation Class', 'Short Term');
  await setField(sapPage, 'Securities Account', '1000');
  await setField(sapPage, 'Number of Units as Text', UNITS);
  await setField(sapPage, 'Security Price Without Currency Ref. with Unit Quotation', PRICE, 0);
  await setField(sapPage, 'Calculation Date', TODAY);
  await setField(sapPage, 'Payment Date', TODAY);
  await pressKey(sapPage, 'Enter');

  await captureEvidence(sapPage, 'ftr-26b-deal-final-filled', 'Structure tab, everything filled, before final Check');

  await clickButton(sapPage, 'M0:48::btn[6]'); // Check
  const msg = await statusMessage(sapPage).catch(() => '?');
  note(`status after Check: "${msg}"`);
  await dumpScreen(sapPage, 'ftr-26b-deal-final-check', { full: true });
  await captureEvidence(sapPage, 'ftr-26b-deal-final-check', 'result of final Check');

  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|make an entry|enter a |error|consistent|payment|warning/i.test(l));
  note(`\n--- message lines ---\n${flags.join('\n') || '(none)'}`);

  // Read back every value that survived the round trip.
  note('\n--- read-back values ---');
  for (const [t, nth] of [
    ['Number of Units as Text', 0], ['Security Price Without Currency Ref. with Unit Quotation', 0],
    ['Securities Account', 0], ['General Valuation Class', 0],
    ['Calculation Date', 0], ['Payment Date', 0], ['Position Value Date', 0],
    ['Payment Currency', 0],
  ] as [string, number][]) {
    const v = await readField(sapPage, t, nth).catch(() => '(not found)');
    note(`  "${t}" = "${v}"`);
  }

  note('\nNOTHING SAVED.');
  writeArtifact('discover-ftr-26b-deal-final-check.txt', out.join('\n'));
});
