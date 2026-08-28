import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo, field,
  writeArtifact, captureEvidence, bodyText, dumpScreen, statusMessage,
  dismissLiveSearch, clickButton, openValueHelp, readSearchHelp, closeValueHelp,
  readField, selectDropdown,
} from '../webgui';
import { screenInputTitles } from '../screens';

/**
 * READ-ONLY discovery, part 4: what do Securities Account and General
 * Valuation Class - the two visibly-blank Structure-tab fields Check (F6)
 * has not yet been satisfied by - actually want?
 *
 * F4's each field's own search help rather than guessing a value
 * (CLAUDE.md rule 4), fills the date fields with the same default Position
 * Value Date already carries, and re-runs Check (F6).
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

test('DISCOVER: FTR_CREATE 26B - Securities Account + General Valuation Class F4', async ({ sapPage }) => {
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

  // ---- F4 Securities Account ----
  await openValueHelp(sapPage, 'Securities Account').catch(async (e) => note(`Securities Account F4 failed: ${e}`));
  await sapPage.waitForTimeout(1000);
  const secAcctHelp = await readSearchHelp(sapPage).catch(() => null);
  if (secAcctHelp) {
    note(`\nSecurities Account F4: ${secAcctHelp.rows.length} rows (of ${secAcctHelp.total})`);
    for (const r of secAcctHelp.rows.slice(0, 20)) note(`  ${r.join(' | ')}`);
    await captureEvidence(sapPage, 'ftr-26b-secacct-f4', 'Securities Account F4');
    await closeValueHelp(sapPage);
  }

  // ---- General Valuation Class is a dropdown, not an F4 text field ----
  // (openValueHelp on it throws "did not open on F4" - it has no such
  // popup). Try the value already known to work for term loans; the error
  // message itself lists every available option if this one does not exist
  // here.
  let gvcValue: string | null = null;
  try {
    gvcValue = await selectDropdown(sapPage, 'General Valuation Class', 'Short Term');
    note(`\nGeneral Valuation Class accepted "Short Term" -> reads "${gvcValue}"`);
  } catch (e) {
    note(`\nGeneral Valuation Class: "Short Term" not available or dropdown failed: ${e}`);
  }

  // ---- fill Securities Account (F4 found exactly one candidate) ----
  const secAcctCandidate = secAcctHelp?.rows?.[0]?.[0];
  note(`\ncandidates: securitiesAccount=${secAcctCandidate ?? '(none)'}  generalValuationClass=${gvcValue ?? '(not set)'}`);

  if (secAcctCandidate) {
    await setField(sapPage, 'Securities Account', secAcctCandidate);
    note(`set Securities Account = "${secAcctCandidate}"`);
  }
  await setField(sapPage, 'Number of Units as Text', UNITS);
  await setField(sapPage, 'Security Price Without Currency Ref. with Unit Quotation', PRICE, 0);
  await setField(sapPage, 'Calculation Date', TODAY);
  await setField(sapPage, 'Payment Date', TODAY);
  await pressKey(sapPage, 'Enter');

  await captureEvidence(sapPage, 'ftr-26b-deal-fully-filled', 'Structure tab, all candidate fields filled, before Check');

  await clickButton(sapPage, 'M0:48::btn[6]'); // Check (F6)
  const msg = await statusMessage(sapPage).catch(() => '?');
  note(`\nstatus after Check: "${msg}"`);
  await dumpScreen(sapPage, 'ftr-26b-deal-postcheck2', { full: true });
  await captureEvidence(sapPage, 'ftr-26b-deal-postcheck2', 'result of second Check (F6)');

  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|make an entry|enter a |error|consistent/i.test(l));
  note(`\n--- Check (F6) result lines ---\n${flags.join('\n') || '(none)'}`);

  note('\nNOTHING SAVED.');
  writeArtifact('discover-ftr-26b-deal-fields.txt', out.join('\n'));
});
