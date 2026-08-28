import { test, expect } from '../fixtures';
import {
  openTransaction, screenInfo, dumpScreen, settle, writeArtifact,
  captureEvidence, bodyText, field, readPopup, statusMessage,
} from '../webgui';

/**
 * READ-ONLY discovery, part 5: what "Check" (F8) - not Save - says is missing.
 *
 * Part 4 found Basic Data's "Issuer Identity Key" F4 returns 0 rows even
 * after clearing every filter: no business partner is set up in an Issuer
 * role on DS4/100 at all. That blocks *switching tabs away from Basic Data*,
 * which is a UI-level guard, not necessarily the same gate Save itself
 * enforces. The master screen's own toolbar carries a "Check" button (F8,
 * id M0:48::btn[8]) - a validate-only action, the same kind of read-only
 * check-run this suite already relies on for TPM1/TBB1/FTR flows. This uses
 * it, never Save, to find the true mandatory set without needing an Issuer
 * that does not exist on this client.
 *
 * WRITES NOTHING. Check validates; it does not commit. Save is never located
 * or pressed in this spec.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const PRODUCT_TYPE = process.env.PRODUCT_TYPE ?? '26B';
const SHORT_NAME = process.env.SHORT_NAME ?? 'NIFTY50 IDX FUN';
const LONG_NAME = process.env.LONG_NAME ?? 'NIIF Nifty 50 Index Fund - Growth';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

type P = import('@playwright-sap/test').Page;

async function clickId(page: P, id: string) {
  await page.locator(`[id="${id}"]`).first().click({ timeout: 20_000 });
  await settle(page, 30_000);
}

test(`DISCOVER: FWZZ ${PRODUCT_TYPE} - Check (F8) from Search Terms, Issuer left blank`, async ({ sapPage }) => {
  test.setTimeout(600_000);

  await openTransaction(sapPage, 'FWZZ');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');
  note(`session: ${JSON.stringify(info)}`);

  await clickId(sapPage, 'M0:46:1::0:50'); // Create, id left blank (internal numbering)
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

  const info2 = await screenInfo(sapPage);
  note(`\nmaster screen open: ${JSON.stringify(info2)}, status: "${await statusMessage(sapPage).catch(() => '?')}"`);
  await dumpScreen(sapPage, `fwzz-${PRODUCT_TYPE}-precheck`, { full: true });
  await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-precheck`, 'Search Terms filled, before Check, Issuer never touched');

  // ---- Check (F8): validates, does not commit ----
  note('\npressing Check (F8) - validates only, never a save');
  await clickId(sapPage, 'M0:48::btn[8]');

  const pop2 = await readPopup(sapPage).catch(() => null);
  if (pop2) note(`popup after Check: ${JSON.stringify(pop2).slice(0, 1500)}`);
  note(`status after Check: "${await statusMessage(sapPage).catch(() => '?')}"`);
  await dumpScreen(sapPage, `fwzz-${PRODUCT_TYPE}-postcheck`, { full: true });
  await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-postcheck`, 'result of Check (F8)');

  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|make an entry|enter a |error/i.test(l));
  note(`\n--- Check (F8) result lines ---\n${flags.join('\n') || '(none - Check reported nothing wrong)'}`);

  note('\nNOTHING SAVED. Check does not commit; Save was never located or pressed.');
  writeArtifact('discover-fwzz-26b-check.txt', out.join('\n'));
});
