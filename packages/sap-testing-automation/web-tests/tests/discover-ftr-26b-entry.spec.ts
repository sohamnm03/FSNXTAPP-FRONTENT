import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, pressKey, screenInfo, field,
  writeArtifact, captureEvidence, bodyText, dumpScreen, readPopup, statusMessage,
  dismissLiveSearch,
} from '../webgui';
import { screenInputTitles } from '../screens';

/**
 * READ-ONLY discovery: FTR_CREATE for product type 26B (Inv: Mutual Funds),
 * transaction type 100 (Investment), using a real Class ID this workspace
 * created via FWZZ (TC-017: 300021/300022/300023).
 *
 * Nothing in this workspace has driven FTR_CREATE with 26B before. This
 * finds out: does the entry screen show a Security Class ID Number field the
 * way it does for 22B (probe-security-class.spec.ts found that field there)?
 * Does a real 26B class id resolve? What deal screen does Enter reach, and
 * what does it require?
 *
 * WRITES NOTHING. Enter derives the deal screen; it does not save.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const COMPANY_CODE = process.env.COMPANY_CODE ?? '9800';
const CLASS_ID = process.env.CLASS_ID ?? '300021';
const PARTNER = process.env.PARTNER ?? '400000003';
const TXN_TYPE = process.env.TXN_TYPE ?? '100';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

test(`DISCOVER: FTR_CREATE 26B/${TXN_TYPE}, class ${CLASS_ID}, co.code ${COMPANY_CODE}`, async ({ sapPage }) => {
  test.setTimeout(300_000);

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  note(`session: ${JSON.stringify(info)}`);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });
  await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Product Type', '26B');
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Financial Transaction Type', TXN_TYPE);
  await dismissLiveSearch(sapPage);

  const entryTitles = await screenInputTitles(sapPage);
  note(`\n--- entry screen inputs after 26B/${TXN_TYPE} set (${Object.keys(entryTitles).length}) ---`);
  for (const [t, n] of Object.entries(entryTitles)) note(`  "${t}" x${n}`);
  await dumpScreen(sapPage, 'ftr-26b-entry-filled', { full: true });
  await captureEvidence(sapPage, 'ftr-26b-entry-filled', 'FTR_CREATE entry, 26B/100 set, before class id / partner');

  const hasClassIdField = Object.keys(entryTitles).some((t) => /security.*class.*id|class.*id.*number/i.test(t));
  note(`\nSecurity Class ID field present: ${hasClassIdField}`);

  if (hasClassIdField) {
    const classTitle = Object.keys(entryTitles).find((t) => /security.*class.*id|class.*id.*number/i.test(t))!;
    await setFieldVerified(sapPage, classTitle, CLASS_ID);
    await dismissLiveSearch(sapPage);
    note(`typed class id "${CLASS_ID}" into "${classTitle}"`);
  }

  const partnerTitle = Object.keys(entryTitles).find((t) => /business partner|partner number/i.test(t));
  if (partnerTitle) {
    await setFieldVerified(sapPage, partnerTitle, PARTNER);
    await dismissLiveSearch(sapPage);
    note(`typed partner "${PARTNER}" into "${partnerTitle}"`);
  } else {
    note(`no partner-like field found on entry screen`);
  }

  await captureEvidence(sapPage, 'ftr-26b-entry-ready', 'FTR_CREATE entry, fully filled, before Enter');
  await pressKey(sapPage, 'Enter');

  const popup = await readPopup(sapPage).catch(() => null);
  if (popup) note(`\npopup after Enter: ${JSON.stringify(popup).slice(0, 1500)}`);
  note(`status after Enter: "${await statusMessage(sapPage).catch(() => '?')}"`);

  const info2 = await screenInfo(sapPage);
  note(`\nscreen after Enter: ${JSON.stringify(info2)}`);
  await dumpScreen(sapPage, 'ftr-26b-deal-screen', { full: true });
  await captureEvidence(sapPage, 'ftr-26b-deal-screen', '26B deal screen (or whatever Enter reached)');

  const dealTitles = await screenInputTitles(sapPage);
  note(`\n--- deal screen inputs (${Object.keys(dealTitles).length}) ---`);
  for (const [t, n] of Object.entries(dealTitles)) note(`  "${t}" x${n}`);

  const tabs = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]'))
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ id: e.id, text: (e.textContent ?? '').trim() })),
  );
  note(`\n--- tabs (${tabs.length}) ---`);
  for (const t of tabs) note(`  [tab] "${t.text}" -> ${t.id}`);

  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|make an entry|enter a |error|does not exist/i.test(l));
  note(`\n--- messages / mandatory hints ---\n${flags.join('\n') || '(none yet)'}`);

  note('\nNOTHING SAVED. This spec never presses Save.');
  writeArtifact('discover-ftr-26b-entry.txt', out.join('\n'));
});
