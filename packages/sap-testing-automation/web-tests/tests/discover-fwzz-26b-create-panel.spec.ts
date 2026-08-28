import { test, expect } from '../fixtures';
import {
  openTransaction, screenInfo, dumpScreen, settle, pressKey, writeArtifact,
  captureEvidence, bodyText, field, readPopup, statusMessage,
} from '../webgui';
import { screenInputTitles } from '../screens';

/**
 * READ-ONLY discovery, part 2: how FWZZ asks for the product type.
 *
 * Part 1 (discover-fwzz-26b-class.spec.ts) established that the FWZZ entry
 * screen SAPLFVW4/0100 carries exactly one input - "Security Class ID Number" -
 * and four action buttons (Create / Display / Change / Delete). There is no
 * product type field on it, so 26B must be asked for somewhere after Create.
 * This finds out where, and maps the class master screen that follows.
 *
 * Also answers whether the candidate ID is free: Display on a non-existent
 * class reports so, which is how a frozen spec can pick an unused id instead
 * of colliding with one.
 *
 * WRITES NOTHING. Create opens the maintenance screen; it does not commit.
 * This spec never presses Save and never confirms a save dialog.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const CLASS_ID = process.env.CLASS_ID ?? '260001';
const PRODUCT_TYPE = process.env.PRODUCT_TYPE ?? '26B';
const ID_FIELD = 'Security Class ID Number';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

async function clickByTitle(page: import('@playwright-sap/test').Page, title: string) {
  const loc = page.locator(`[role="button"][title="${title}"]`).first();
  await loc.waitFor({ state: 'visible', timeout: 20_000 });
  await loc.click();
  await settle(page, 30_000);
}

async function snapshot(page: import('@playwright-sap/test').Page, name: string) {
  const info = await screenInfo(page);
  note(`\n=== ${name} === screen: ${JSON.stringify(info)}`);
  const popup = await readPopup(page).catch(() => null);
  if (popup) note(`popup: ${JSON.stringify(popup).slice(0, 1500)}`);
  note(`status: "${await statusMessage(page).catch(() => '?')}"`);
  await dumpScreen(page, name, { full: true });
  const titles = await screenInputTitles(page);
  note(`inputs (${Object.keys(titles).length}):`);
  for (const [t, n] of Object.entries(titles)) note(`  "${t}" x${n}`);
  return { info, titles };
}

test(`DISCOVER: FWZZ Create path for ${PRODUCT_TYPE}, candidate id ${CLASS_ID}`, async ({ sapPage }) => {
  test.setTimeout(900_000);

  // ------------------------------------------ is the candidate id free?
  await openTransaction(sapPage, 'FWZZ');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');
  note(`session: ${JSON.stringify(info)}`);

  await field(sapPage, ID_FIELD).click();
  await field(sapPage, ID_FIELD).pressSequentially(CLASS_ID, { delay: 40 });
  await clickByTitle(sapPage, 'Display');
  await snapshot(sapPage, `fwzz-display-${CLASS_ID}`);
  await captureEvidence(sapPage, `fwzz-display-${CLASS_ID}`, `Display on candidate id ${CLASS_ID} - does it exist?`);

  // ------------------------------------------------- the Create path
  await openTransaction(sapPage, 'FWZZ');
  await field(sapPage, ID_FIELD).click();
  await field(sapPage, ID_FIELD).pressSequentially(CLASS_ID, { delay: 40 });
  note(`\ntyped id "${await field(sapPage, ID_FIELD).inputValue()}", pressing Create`);
  await clickByTitle(sapPage, 'Create');
  const afterCreate = await snapshot(sapPage, `fwzz-after-create-${CLASS_ID}`);
  await captureEvidence(sapPage, `fwzz-after-create-${CLASS_ID}`, 'screen/dialog immediately after Create');

  // Where did the product type go? Look for it among whatever is now on screen.
  const ptTitle = Object.keys(afterCreate.titles).find((t) => /product\s*type/i.test(t));
  note(`\nproduct type field after Create: ${ptTitle ? `"${ptTitle}"` : 'NOT FOUND'}`);

  if (ptTitle) {
    const el = field(sapPage, ptTitle);
    await el.click();
    await el.press('Control+a');
    await el.pressSequentially(PRODUCT_TYPE, { delay: 40 });
    note(`typed "${PRODUCT_TYPE}" -> field reads "${await el.inputValue()}"`);
    await pressKey(sapPage, 'Enter');
    await settle(sapPage, 30_000);
    await snapshot(sapPage, `fwzz-${PRODUCT_TYPE}-master`);
    await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-master`, `class master for ${PRODUCT_TYPE}`);
  }

  // ------------------------------------------------------------ the tabs
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
    await settle(sapPage, 25_000);
    const slug = (t.text || t.id).replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 40);
    await snapshot(sapPage, `fwzz-${PRODUCT_TYPE}-tab-${slug}`);
  }

  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|enter a|make an entry|does not exist/i.test(l));
  note(`\n--- messages / mandatory hints ---\n${flags.join('\n') || '(none)'}`);

  note('\nNOTHING SAVED. This spec never presses Save.');
  writeArtifact('discover-fwzz-26b-create-panel.txt', out.join('\n'));
});
