import { test, expect } from '../fixtures';
import {
  openTransaction, screenInfo, dumpScreen, settle, pressKey, writeArtifact,
  captureEvidence, bodyText, field, readPopup, statusMessage,
} from '../webgui';
import { screenInputTitles } from '../screens';

/**
 * READ-ONLY discovery: FWZZ (Create Class) for product type 26B, Inv: Mutual Funds.
 *
 * Nothing in this workspace has ever driven FWZZ, and no screen model exists
 * for it. Before a frozen spec can create a class, the entry screen's fields,
 * the class master screen's tabs, and which fields are mandatory for 26B all
 * have to be read off the live system rather than assumed - CLAUDE.md rule 4.
 *
 * WRITES NOTHING. Enter derives the class master screen, it does not commit;
 * this spec never presses Save and never confirms a dialog.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const PRODUCT_TYPE = process.env.PRODUCT_TYPE ?? '26B';
const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

/** Pick a live input title by regex, so no id or label is hardcoded. */
function pickTitle(titles: Record<string, number>, re: RegExp): string | null {
  return Object.keys(titles).find((t) => re.test(t)) ?? null;
}

test(`DISCOVER: FWZZ class master for product type ${PRODUCT_TYPE}`, async ({ sapPage }) => {
  test.setTimeout(600_000);

  // ---------------------------------------------------------- entry screen
  await openTransaction(sapPage, 'FWZZ');
  const info = await screenInfo(sapPage);
  note(`screen info: ${JSON.stringify(info)}`);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await dumpScreen(sapPage, 'fwzz-entry', { full: true });
  const entryTitles = await screenInputTitles(sapPage);
  note(`\n--- FWZZ entry screen inputs (${Object.keys(entryTitles).length}) ---`);
  for (const [t, n] of Object.entries(entryTitles)) note(`  "${t}" x${n}`);
  await captureEvidence(sapPage, 'fwzz-entry', 'FWZZ initial screen before anything is typed');

  // ------------------------------------------- what product type field is it
  const ptTitle = pickTitle(entryTitles, /product\s*(type|categ)/i);
  note(`\nproduct type field resolved to: ${ptTitle ? `"${ptTitle}"` : 'NOT FOUND'}`);
  if (!ptTitle) {
    writeArtifact('discover-fwzz-26b.txt', out.join('\n'));
    throw new Error('no product-type-like input on the FWZZ entry screen - see the dump');
  }

  // What does 26B's own F4 call itself? Confirms the product type exists on
  // this client before anything is built on it.
  const ptEl = field(sapPage, ptTitle);
  await ptEl.click();
  await ptEl.press('Control+a');
  await ptEl.pressSequentially(PRODUCT_TYPE, { delay: 40 });
  note(`typed product type "${PRODUCT_TYPE}", field reads "${await ptEl.inputValue()}"`);

  const idTitle = pickTitle(entryTitles, /(security|class).*(id|number)|^id number/i);
  note(`class id field resolved to: ${idTitle ? `"${idTitle}"` : 'NOT FOUND (likely internally assigned)'}`);

  await pressKey(sapPage, 'Enter');
  await settle(sapPage, 30_000);

  const popup = await readPopup(sapPage).catch(() => null);
  if (popup) note(`\npopup after Enter: ${JSON.stringify(popup).slice(0, 800)}`);
  note(`status message after Enter: "${await statusMessage(sapPage).catch(() => '?')}"`);

  const info2 = await screenInfo(sapPage);
  note(`screen after Enter: ${JSON.stringify(info2)}`);
  await dumpScreen(sapPage, `fwzz-${PRODUCT_TYPE}-master`, { full: true });
  await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-master`, `class master screen for ${PRODUCT_TYPE}`);

  const masterTitles = await screenInputTitles(sapPage);
  note(`\n--- class master inputs (${Object.keys(masterTitles).length}) ---`);
  for (const [t, n] of Object.entries(masterTitles)) note(`  "${t}" x${n}`);

  // ------------------------------------------------------------- the tabs
  const tabs = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]'))
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ id: e.id, text: (e.textContent ?? '').trim() })),
  );
  note(`\n--- tabs (${tabs.length}) ---`);
  for (const t of tabs) note(`  [tab] "${t.text}" -> ${t.id}`);

  for (const t of tabs) {
    if (!t.id) continue;
    await sapPage.locator(`[id="${t.id}"]`).click({ timeout: 15_000 }).catch(() => {});
    await settle(sapPage, 20_000);
    const slug = (t.text || t.id).replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 40);
    await dumpScreen(sapPage, `fwzz-${PRODUCT_TYPE}-tab-${slug}`, { full: true });
    const tabTitles = await screenInputTitles(sapPage);
    note(`\n--- tab "${t.text}" inputs (${Object.keys(tabTitles).length}) ---`);
    for (const [ti, n] of Object.entries(tabTitles)) note(`  "${ti}" x${n}`);
  }

  // Mandatory-field hints SAP prints in the body text.
  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|enter a|make an entry/i.test(l));
  note(`\n--- mandatory hints on screen ---\n${flags.join('\n') || '(none printed yet)'}`);

  note('\nNOTHING SAVED. This spec never presses Save.');
  writeArtifact('discover-fwzz-26b.txt', out.join('\n'));
});
