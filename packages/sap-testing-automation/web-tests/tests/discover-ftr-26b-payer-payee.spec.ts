import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo,
  writeArtifact, captureEvidence, dismissLiveSearch, clickButton, selectDropdown,
  statusMessage, readField, bodyText, dumpScreen,
} from '../webgui';
import { screenInputTitles } from '../screens';

/**
 * READ-ONLY discovery: Save on the 26B deal screen refuses even after
 * multiple presses with "No payment details entered for transaction" -
 * despite Check (F6) labelling it a Warning, Save itself treats it as
 * blocking (discover-ftr-26b-save-twice.spec.ts). The Payment Details tab's
 * only real field is "Payer/Payee" (discover-ftr-26b-payment-details.spec.ts).
 * This fills it with the deal's own partner and re-checks.
 *
 * WRITES NOTHING.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const COMPANY_CODE = process.env.COMPANY_CODE ?? '9990';
const CLASS_ID = process.env.CLASS_ID ?? '300025';
const PARTNER = process.env.PARTNER ?? '400000003';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

test('DISCOVER: fill Payer/Payee on Payment Details, then Check', async ({ sapPage }) => {
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

  // ---- Payment Details tab ----
  const tabs = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]'))
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ id: e.id, text: (e.textContent ?? '').trim() })),
  );
  const paymentTab = tabs.find((t) => /payment details/i.test(t.text));
  if (!paymentTab) throw new Error('Payment Details tab not found');
  await sapPage.locator(`[id="${paymentTab.id}"]`).click({ timeout: 15_000 });
  await sapPage.waitForTimeout(1500);

  const titlesBefore = await screenInputTitles(sapPage);
  note(`Payment Details tab inputs before fill: ${Object.keys(titlesBefore).join(', ')}`);

  const payerField = Object.keys(titlesBefore).find((t) => /payer.*payee/i.test(t));
  note(`Payer/Payee field: ${payerField ?? '(not found)'}`);
  if (payerField) {
    await setField(sapPage, payerField, PARTNER);
    await pressKey(sapPage, 'Enter');
    const back = await readField(sapPage, payerField).catch(() => '?');
    note(`Payer/Payee reads back: "${back}"`);
  }

  await dumpScreen(sapPage, 'ftr-26b-payment-details-filled', { full: true });
  await captureEvidence(sapPage, 'ftr-26b-payment-details-filled', 'Payment Details tab, Payer/Payee filled');

  await clickButton(sapPage, 'M0:48::btn[6]'); // Check
  const msg = await statusMessage(sapPage).catch(() => '?');
  note(`\nstatus after Check with Payer/Payee filled: "${msg}"`);

  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|make an entry|enter a |error|consistent|payment|warning/i.test(l));
  note(`\n--- message lines ---\n${flags.join('\n') || '(none)'}`);

  note('\nNOTHING SAVED.');
  writeArtifact('discover-ftr-26b-payer-payee.txt', out.join('\n'));
});
