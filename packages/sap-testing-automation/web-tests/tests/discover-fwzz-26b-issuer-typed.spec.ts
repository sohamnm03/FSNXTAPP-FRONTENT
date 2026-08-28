import { test, expect } from '../fixtures';
import {
  openTransaction, screenInfo, dumpScreen, settle, writeArtifact,
  captureEvidence, bodyText, field, readPopup, statusMessage, setField,
} from '../webgui';

/**
 * READ-ONLY discovery, part 6: does Basic Data accept a typed Business
 * Partner number as Issuer, the way probe-security-class.spec.ts found
 * FTR_CREATE accepts a typed Security Class ID when its own F4 is empty?
 *
 * Part 4 found Issuer Identity Key's F4 returns 0 rows even filter-cleared -
 * no business partner is set up in an Issuer role on DS4/100. Part 5's Check
 * (F8) confirmed Issuer and Issue Currency are both hard-required to save.
 * This tries a Business Partner already used elsewhere in this workspace
 * (400000003, from probe-security-class.spec.ts) typed directly into Issuer,
 * plus INR for Issue Currency, then re-runs Check (F8) - never Save - to see
 * whether SAP accepts a typed id it did not offer, or refuses it outright.
 *
 * WRITES NOTHING. Check validates; it does not commit.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const PRODUCT_TYPE = process.env.PRODUCT_TYPE ?? '26B';
const SHORT_NAME = process.env.SHORT_NAME ?? 'NIFTY50 IDX FUN';
const LONG_NAME = process.env.LONG_NAME ?? 'NIIF Nifty 50 Index Fund - Growth';
const ISSUER_BP = process.env.ISSUER_BP ?? '400000003';
const ISSUE_CCY = process.env.ISSUE_CCY ?? 'INR';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

type P = import('@playwright-sap/test').Page;

async function clickId(page: P, id: string) {
  await page.locator(`[id="${id}"]`).first().click({ timeout: 20_000 });
  await settle(page, 30_000);
}

test(`DISCOVER: FWZZ ${PRODUCT_TYPE} - typed Issuer ${ISSUER_BP} + Issue Currency ${ISSUE_CCY}, Check only`, async ({ sapPage }) => {
  test.setTimeout(600_000);

  await openTransaction(sapPage, 'FWZZ');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');
  note(`session: ${JSON.stringify(info)}`);

  await clickId(sapPage, 'M0:46:1::0:50'); // Create, id left blank
  const set = async (title: string, value: string, nth: number) => {
    const el = field(sapPage, title, nth);
    await el.click();
    await el.press('Control+a');
    await el.pressSequentially(value, { delay: 40 });
  };
  await set('Product Type', PRODUCT_TYPE, 0);
  await set('Short Name', SHORT_NAME, 0);
  await set('Long Name', LONG_NAME, 0);
  await clickId(sapPage, 'M1:48::btn[5]'); // Create (F5)

  let pop = await readPopup(sapPage).catch(() => null);
  if (pop) {
    const cont = pop.buttons.find((b) => /continue/i.test(b.title ?? b.text ?? ''));
    if (cont) await clickId(sapPage, cont.id);
  }

  // Switch to Basic Data, type Issuer + Issue Currency directly (no F4 pick).
  await clickId(sapPage, 'M0:46:2::0:1-title');
  await setField(sapPage, 'Issuer Identity Key', ISSUER_BP, 0);
  await setField(sapPage, 'Issue Currency', ISSUE_CCY, 0);
  await sapPage.keyboard.press('Tab');
  await settle(sapPage, 15_000);

  note(`\nIssuer field now reads: "${await field(sapPage, 'Issuer Identity Key').inputValue().catch(() => '?')}"`);
  note(`Issue Currency field now reads: "${await field(sapPage, 'Issue Currency').inputValue().catch(() => '?')}"`);

  const popImmediate = await readPopup(sapPage).catch(() => null);
  if (popImmediate) note(`popup right after typing: ${JSON.stringify(popImmediate).slice(0, 1200)}`);

  await dumpScreen(sapPage, `fwzz-${PRODUCT_TYPE}-issuer-typed`, { full: true });
  await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-issuer-typed`, `Issuer=${ISSUER_BP}, Issue Currency=${ISSUE_CCY} typed directly`);

  // ---- Check (F8) again ----
  note('\npressing Check (F8) with Issuer + Issue Currency typed - validates only');
  await clickId(sapPage, 'M0:48::btn[8]');
  const pop2 = await readPopup(sapPage).catch(() => null);
  if (pop2) note(`popup after Check: ${JSON.stringify(pop2).slice(0, 1800)}`);
  await dumpScreen(sapPage, `fwzz-${PRODUCT_TYPE}-postcheck-typed`, { full: true });
  await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-postcheck-typed`, 'result of Check (F8) with typed Issuer/currency');

  note('\nNOTHING SAVED. Check does not commit; Save was never located or pressed.');
  writeArtifact('discover-fwzz-26b-issuer-typed.txt', out.join('\n'));
});
