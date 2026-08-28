import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo,
  writeArtifact, selectDropdown, clickButton, handleKnownPopups, handleSaveDialogs,
  bodyText, statusMessage, readField, findSaveButton, captureEvidence,
} from '../webgui';

/**
 * TC-006 create-only attempt on company code 9999, using the two partner
 * numbers proven valid there by the pre-existing deal 100011 (see
 * probe-existing-deal.spec.ts and results/TC-006-2026-08-17-1900-existing-deal.md):
 * Business Partner Number 400000000 (counterparty), Beneficiary 400000001.
 *
 * Create only - deliberately stops after Save. No settle, no TBB1.
 *
 *   npx playwright test tests/tc006-38a-create-9999.spec.ts
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;

const COMPANY_CODE = '9999';
const PRODUCT = '38A';
const TXN = '100';
const PARTNER = '400000000';
const BENEFICIARY = '400000001';

test(`TC-006 create-only: ${PRODUCT}/${TXN} on co.code ${COMPANY_CODE}, partner ${PARTNER}`, async ({ sapPage }) => {
  test.setTimeout(300_000);
  const log: string[] = [];
  const note = (s: string) => { log.push(s); console.log(s); };

  // ============================================================ FTR_CREATE
  await openTransaction(sapPage, 'FTR_CREATE');
  let info = await screenInfo(sapPage);
  note(`SYSTEM @FTR_CREATE: ${JSON.stringify(info)}`);
  expect(info.system, 'must be DS4').toContain('DS4');
  expect(info.client, 'must be client 100').toContain('100');
  await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });

  await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
  await setFieldVerified(sapPage, 'Product Type', PRODUCT);
  await setFieldVerified(sapPage, 'Financial Transaction Type', TXN);
  await setFieldVerified(sapPage, 'Business Partner Number', PARTNER);
  await pressKey(sapPage, 'Enter');

  const entryText = await bodyText(sapPage);
  const entryErr = entryText.split('\n').map((l) => l.trim()).find((l) => /^Error:/i.test(l));
  note(`after Enter: ${JSON.stringify(await screenInfo(sapPage))}`);
  if (entryErr) note(`ENTRY REFUSED: ${entryErr}`);
  expect(entryErr, `entry screen refused: ${entryErr}`).toBeFalsy();

  // ---- Deal screen (Structure tab) ----
  note('--- deal screen ---');
  await setField(sapPage, 'Term From', '01.01.2026');
  note('  Term From = "01.01.2026"');
  await setField(sapPage, 'Amount as Text Field', '100000');
  note('  Amount as Text Field = "100000"');
  await setField(sapPage, 'Term To', '01.07.2026');
  note('  Term To = "01.07.2026"');
  await setField(sapPage, 'Contract Date', '01.01.2026');
  note('  Contract Date = "01.01.2026"');
  await setField(sapPage, 'Beneficiary', BENEFICIARY);
  note(`  Beneficiary = "${BENEFICIARY}"`);

  const dropdownGot = await selectDropdown(sapPage, 'Payment Term', 'By Negotiation');
  note(`  dropdown Payment Term = "${dropdownGot}"`);
  await handleKnownPopups(sapPage, SAFE_POPUP, note);

  // Save's own check run demands "General Valuation Class" (co.code 9800's
  // deal screen never renders this field at all - see TC-006 16:30 run - but
  // co.code 9999's Administration tab does have "Gen. Valn Class", confirmed
  // read-only via probe-existing-deal.spec.ts). Same tab/title/option this
  // workspace already proved for 51A/60A (MM/FX) in business-area-flows.spec.ts.
  await handleKnownPopups(sapPage, SAFE_POPUP, note);
  const adminTabId = await sapPage.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(
      (t) => (t as HTMLElement).innerText.trim() === 'Administration',
    );
    return tab?.id ?? null;
  });
  if (!adminTabId) throw new Error('Administration tab not found on this deal screen');
  await clickButton(sapPage, adminTabId, 15_000);
  await handleKnownPopups(sapPage, SAFE_POPUP, note);
  note(`  opened tab "Administration" (${adminTabId})`);
  const valnGot = await selectDropdown(sapPage, 'General Valuation Class', 'Short-term investments');
  note(`  dropdown General Valuation Class = "${valnGot}"`);
  await handleKnownPopups(sapPage, SAFE_POPUP, note);

  await pressKey(sapPage, 'Enter');
  const popups1 = await handleKnownPopups(sapPage, SAFE_POPUP, note);
  note(`popups handled before save: ${popups1.handled}`);
  expect(popups1.blocked, `unexpected dialog: ${popups1.blocked}`).toBeNull();

  const filledText = await bodyText(sapPage);
  const filledErr = filledText.split('\n').map((l) => l.trim()).find((l) => /^Error:/i.test(l));
  if (filledErr) note(`FIELD ENTRY REFUSED: ${filledErr}`);
  expect(filledErr, `fields refused: ${filledErr}`).toBeFalsy();
  note(`status after Enter: ${await statusMessage(sapPage)}`);

  // ======================= WRITE: save the deal =======================
  await captureEvidence(sapPage, 'tc006-9999-create-deal-filled');
  const saveBtn = (await findSaveButton(sapPage)) ?? 'M0:50::btn[11]';
  note(`Save button resolved to: ${saveBtn}`);
  note(`*** WRITE: SAVING the Letter of Credit deal - this commits to DS4/100 ***`);
  await clickButton(sapPage, saveBtn);

  const popups2 = await handleSaveDialogs(sapPage, SAFE_POPUP, note);
  note(`dialogs handled during save: ${popups2.handled}`);
  if (popups2.checkRun.length) {
    writeArtifact('tc006-9999-create-check-run.txt', popups2.checkRun.join('\n\n'));
  }
  if (popups2.blocked) {
    note(`SAVE BLOCKED: ${popups2.blocked}`);
    writeArtifact('tc006-9999-create-flow-log.txt', log.join('\n'));
    await captureEvidence(sapPage, 'tc006-9999-create-blocked');
  }
  expect(popups2.blocked, `unexpected dialog during save: ${popups2.blocked}`).toBeNull();

  const savedText = await bodyText(sapPage);
  const status1 = await statusMessage(sapPage);
  note(`status after save: "${status1}"`);

  const errLine = savedText.split('\n').map((l) => l.trim()).find((l) => /^Error:/i.test(l)) ?? '';
  if (errLine) note(`SAP REFUSED THE SAVE: ${errLine}`);
  expect(errLine, `SAP refused the save: ${errLine}`).toBe('');

  const msgLine =
    savedText.split('\n').map((l) => l.trim())
      .find((l) => /created|angelegt|\bsaved\b/i.test(l)) ?? '';
  note(`message line: "${msgLine}"`);

  const fromField = (await readField(sapPage, 'Financial Transaction Number').catch(() => '')).trim();
  note(`Financial Transaction Number field: "${fromField}"`);

  const dealNo =
    msgLine.match(/\b(\d{5,12})\b/)?.[1] ??
    status1.match(/\b(\d{5,12})\b/)?.[1] ??
    (/^\d{5,12}$/.test(fromField) ? fromField : '');
  note(`DEAL NUMBER: ${dealNo || 'NOT OBSERVED'}`);

  expect(dealNo, 'a deal number must be captured from the save confirmation').toMatch(/^\d{5,12}$/);
  writeArtifact('tc006-9999-create-deal-number.txt', dealNo);
  note(`  evidence: ${await captureEvidence(sapPage, `tc006-9999-${dealNo}-created`)}`);

  note('STAGE=save - deal created. Stopping here, no settle/post requested.');
  writeArtifact('tc006-9999-create-flow-log.txt', log.join('\n'));
});
