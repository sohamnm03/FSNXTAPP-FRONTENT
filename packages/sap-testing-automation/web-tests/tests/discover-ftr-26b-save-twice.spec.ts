import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo,
  writeArtifact, captureEvidence, dismissLiveSearch, clickButton, selectDropdown,
  statusMessage, readField, readPopup,
} from '../webgui';

/**
 * Does the 26B deal screen's Save button need a SECOND press to actually
 * commit past the "No payment details entered for transaction" warning?
 *
 * TC-019's first live attempt clicked Save once (M0:50::btn[11], the only
 * Save-related element on screen - confirmed by
 * discover-ftr-26b-save-button.spec.ts) and the Transaction field still read
 * the internal placeholder afterwards - nothing committed, but nothing threw
 * either. This tests pressing it a second time, against the class TC-019's
 * failed run already created (300025), rather than creating a third one.
 *
 * THIS WRITES TO THE DATABASE if the hypothesis is right - it is the actual
 * save. Confirmed by the human before running, same as any other write in
 * this workspace (CLAUDE.md rule 3).
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const COMPANY_CODE = process.env.COMPANY_CODE ?? '9990';
const CLASS_ID = process.env.CLASS_ID ?? '300025';
const PARTNER = process.env.PARTNER ?? '400000003';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

test('TEST: does a second Save press commit the 26B deal?', async ({ sapPage }) => {
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
  note(`Position Value Date (SAP default): "${positionValueDate}"`);
  await selectDropdown(sapPage, 'General Valuation Class', 'Short Term');
  await setField(sapPage, 'Securities Account', '1000');
  await setField(sapPage, 'Number of Units as Text', '1000');
  await setField(sapPage, 'Security Price Without Currency Ref. with Unit Quotation', '100', 0);
  await setField(sapPage, 'Calculation Date', positionValueDate);
  await setField(sapPage, 'Payment Date', positionValueDate);
  await pressKey(sapPage, 'Enter');

  const beforeTxn = await readField(sapPage, 'Financial Transaction Number').catch(() => '?');
  note(`Transaction before any Save press: "${beforeTxn}"`);

  for (let i = 1; i <= 3; i++) {
    note(`\n--- round ${i}: Enter, then Save ---`);
    await pressKey(sapPage, 'Enter');
    const midMsg = await statusMessage(sapPage).catch(() => '?');
    note(`  status after Enter: "${midMsg}"`);
    await clickButton(sapPage, 'M0:50::btn[11]');
    const msg = await statusMessage(sapPage).catch(() => '?');
    const popup = await readPopup(sapPage).catch(() => null);
    const txn = await readField(sapPage, 'Financial Transaction Number').catch(() => '?');
    note(`  status: "${msg}"`);
    if (popup) note(`  popup: ${JSON.stringify(popup).slice(0, 800)}`);
    note(`  Transaction field: "${txn}"`);
    await captureEvidence(sapPage, `ftr-26b-save-press-${i}`, `after Save press #${i}`);

    if (txn && txn !== '\\INTERN\\') {
      note(`\nCOMMITTED after press #${i}: deal ${txn}`);
      writeArtifact('discover-ftr-26b-save-twice.txt', out.join('\n'));
      return;
    }
    if (popup) {
      const cont = popup.buttons.find((b) => /continue|yes|confirm|save/i.test(b.title ?? b.text ?? ''));
      if (cont) {
        note(`  confirming popup via "${cont.id}"`);
        await sapPage.locator(`[id="${cont.id}"]`).click({ timeout: 15_000 });
        await sapPage.waitForTimeout(1500);
      }
    }
  }

  note('\nStill not committed after 3 Save presses.');
  writeArtifact('discover-ftr-26b-save-twice.txt', out.join('\n'));
});
