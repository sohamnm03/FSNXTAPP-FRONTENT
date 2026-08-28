import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo,
  writeArtifact, captureEvidence, bodyText, dumpScreen, statusMessage,
  dismissLiveSearch, clickButton,
} from '../webgui';

/**
 * READ-ONLY discovery, part 3: Check (F6) on the 26B deal screen refused with
 * a generic "Fill out all required entry fields" and a "View Details" link.
 * This clicks that link to get the field-by-field list, and additionally
 * tries the Securities Account / General Valuation Class fields, which are
 * the two obviously-blank fields Check part 2 did not fill.
 *
 * WRITES NOTHING.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const COMPANY_CODE = process.env.COMPANY_CODE ?? '9990';
const CLASS_ID = process.env.CLASS_ID ?? '300021';
const PARTNER = process.env.PARTNER ?? '400000003';
const UNITS = process.env.UNITS ?? '1000';
const PRICE = process.env.PRICE ?? '100';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

test('DISCOVER: FTR_CREATE 26B - View Details on the required-fields refusal', async ({ sapPage }) => {
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

  await setField(sapPage, 'Number of Units as Text', UNITS);
  await setField(sapPage, 'Security Price Without Currency Ref. with Unit Quotation', PRICE, 0);

  await clickButton(sapPage, 'M0:48::btn[6]'); // Check (F6)
  const msg1 = await statusMessage(sapPage).catch(() => '?');
  note(`status after first Check: "${msg1}"`);

  // "View Details" is rendered as part of the status/message area text, not a
  // discrete button in the lean dump - find it by role/text and click it.
  const detailsLink = sapPage.locator('text=View Details').first();
  const hasDetails = await detailsLink.count();
  note(`"View Details" link present: ${hasDetails > 0}`);
  if (hasDetails > 0) {
    await detailsLink.click({ timeout: 10_000 }).catch((e) => note(`click failed: ${e}`));
    await sapPage.waitForTimeout(2000);
    const text = await bodyText(sapPage);
    note(`\n--- body text after View Details click ---\n${text.slice(0, 3000)}`);
    await dumpScreen(sapPage, 'ftr-26b-check-details', { full: true });
    await captureEvidence(sapPage, 'ftr-26b-check-details', 'View Details on the required-fields message');
  }

  note('\nNOTHING SAVED.');
  writeArtifact('discover-ftr-26b-deal-details.txt', out.join('\n'));
});
