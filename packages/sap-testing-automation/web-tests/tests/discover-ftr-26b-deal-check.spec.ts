import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo, field,
  writeArtifact, captureEvidence, bodyText, dumpScreen, readPopup, statusMessage,
  dismissLiveSearch, clickButton,
} from '../webgui';
import { screenInputTitles } from '../screens';

/**
 * READ-ONLY discovery, part 2: what does FTR_CREATE 26B/100 (co.code 9990)
 * actually require to save?
 *
 * Part 1 (discover-ftr-26b-entry.spec.ts) reached the deal screen
 * (SAPLTTM_UI_FRAMEWORK/1110) with the entry fields only - class 300021,
 * partner 400000003. This fills the obviously-blank Structure-tab fields with
 * plausible mock values and presses Check (F6, id M0:48::btn[6]) - a
 * validate-only action, never a save - to find the true mandatory set,
 * mirroring the FWZZ discovery's use of Check (F8) for the same purpose.
 *
 * WRITES NOTHING. Check validates; it does not commit.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const COMPANY_CODE = process.env.COMPANY_CODE ?? '9990';
const CLASS_ID = process.env.CLASS_ID ?? '300021';
const PARTNER = process.env.PARTNER ?? '400000003';
const UNITS = process.env.UNITS ?? '1000';
const PRICE = process.env.PRICE ?? '100';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

test('DISCOVER: FTR_CREATE 26B deal screen - fill + Check (F6)', async ({ sapPage }) => {
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
  note(`deal screen: ${JSON.stringify(info)}`);
  if (!info.screen?.includes('SAPLTTM_UI_FRAMEWORK')) {
    await dumpScreen(sapPage, 'ftr-26b-deal-check-unexpected', { full: true });
    throw new Error(`did not reach the deal screen - landed on ${info.screen}`);
  }

  // ---- fill the obviously-blank fields ----
  await setField(sapPage, 'Number of Units as Text', UNITS);
  note(`set Number of Units = "${UNITS}"`);
  await setField(sapPage, 'Security Price Without Currency Ref. with Unit Quotation', PRICE, 0);
  note(`set Security Price = "${PRICE}"`);

  await captureEvidence(sapPage, 'ftr-26b-deal-filled', 'Structure tab, units + price filled, before Check');

  // ---- Check (F6): validates, does not commit ----
  note('\npressing Check (F6) - validates only, never a save');
  await clickButton(sapPage, 'M0:48::btn[6]');

  const popup = await readPopup(sapPage).catch(() => null);
  if (popup) note(`\npopup after Check: ${JSON.stringify(popup).slice(0, 2000)}`);
  note(`status after Check: "${await statusMessage(sapPage).catch(() => '?')}"`);
  await dumpScreen(sapPage, 'ftr-26b-deal-postcheck', { full: true });
  await captureEvidence(sapPage, 'ftr-26b-deal-postcheck', 'result of Check (F6)');

  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|make an entry|enter a |error/i.test(l));
  note(`\n--- Check (F6) result lines ---\n${flags.join('\n') || '(none - Check reported nothing wrong)'}`);

  const titles = await screenInputTitles(sapPage);
  note(`\n--- inputs after Check (${Object.keys(titles).length}) ---`);
  for (const t of Object.keys(titles)) note(`  "${t}"`);

  note('\nNOTHING SAVED. Check does not commit.');
  writeArtifact('discover-ftr-26b-deal-check.txt', out.join('\n'));
});
