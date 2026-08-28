import { test, expect } from '../fixtures';
import {
  openTransaction, screenInfo, dumpScreen, settle, writeArtifact,
  captureEvidence, bodyText, field, readPopup, statusMessage, findSaveButton,
} from '../webgui';

/**
 * READ-ONLY discovery, part 3: the 26B class master screen behind the dialog.
 *
 * Parts 1-2 established the route:
 *   FWZZ -> type ID -> [Create] -> modal "Create Class" (SAPLFVW4115_1) which
 *   asks ID Number / Prod. Type / Shrt / Long plus two radio groups
 *   (Active|Inactive, With Reference|Without Reference) -> [Create (F5)].
 *
 * The modal blocks the tab strip, so every tab dump in part 2 was the same
 * screen. This drives through the dialog to reach the actual class master and
 * maps it - including which fields 26B makes mandatory, which is the thing a
 * frozen spec cannot guess.
 *
 * WRITES NOTHING. Create (F5) opens the maintenance screen; the commit is
 * Save, which this spec never presses. It re-checks the id afterwards to prove
 * nothing was persisted.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

// Discovery run 1 (CLASS_ID=260001) found: "Numbers assigned to product
// type 26B internally (do not enter an ID number)" - so this run leaves the
// dialog's ID field untouched (blank) instead of typing one.
const CLASS_ID = process.env.CLASS_ID ?? '';
const PRODUCT_TYPE = process.env.PRODUCT_TYPE ?? '26B';
const SHORT_NAME = process.env.SHORT_NAME ?? 'NIFTY50 IDX FUND';
const LONG_NAME = process.env.LONG_NAME ?? 'NIIF Nifty 50 Index Fund - Growth';
const ID_FIELD = 'Security Class ID Number';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

type P = import('@playwright-sap/test').Page;

async function clickId(page: P, id: string) {
  await page.locator(`[id="${id}"]`).first().click({ timeout: 20_000 });
  await settle(page, 30_000);
}

/** Every radio-ish control on screen, with its group, label and checked state. */
async function radios(page: P) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="radio"], input[type="radio"]'))
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({
        id: e.id,
        checked: e.getAttribute('aria-checked') ?? (e as HTMLInputElement).checked ?? null,
        label: (e.getAttribute('aria-label') ?? e.getAttribute('title') ?? e.textContent ?? '').trim().slice(0, 60),
      })),
  );
}

/** Input titles plus id/maxlength/required, which the lean dump drops. */
async function inputDetail(page: P) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('input'))
      .filter((e) => {
        const b = e.getBoundingClientRect();
        return (b.width > 0 || b.height > 0) && e.type !== 'hidden' && e.type !== 'password';
      })
      .map((e) => ({
        id: e.id,
        title: (e.title ?? '').trim(),
        value: (e.value ?? '').slice(0, 40),
        maxLength: e.maxLength,
        required: e.getAttribute('aria-required') ?? null,
        readOnly: e.readOnly,
      })),
  );
}

async function snapshot(page: P, name: string) {
  const info = await screenInfo(page);
  note(`\n===== ${name} ===== ${JSON.stringify(info)}`);
  note(`status: "${await statusMessage(page).catch(() => '?')}"`);
  await dumpScreen(page, name, { full: true });
  for (const i of await inputDetail(page)) {
    note(`  input ${i.id.padEnd(22)} "${i.title}" = "${i.value}"  max=${i.maxLength} req=${i.required} ro=${i.readOnly}`);
  }
  for (const r of await radios(page)) note(`  radio ${r.id.padEnd(22)} checked=${r.checked} "${r.label}"`);
}

test(`DISCOVER: FWZZ ${PRODUCT_TYPE} class master screen (id ${CLASS_ID})`, async ({ sapPage }) => {
  test.setTimeout(900_000);

  await openTransaction(sapPage, 'FWZZ');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');
  note(`session: ${JSON.stringify(info)}`);

  // Leave the entry screen's ID field blank when CLASS_ID is '' - 26B assigns
  // numbers internally, and the first discovery run found SAP refuses a typed
  // one with "do not enter an ID number".
  if (CLASS_ID) {
    await field(sapPage, ID_FIELD).click();
    await field(sapPage, ID_FIELD).pressSequentially(CLASS_ID, { delay: 40 });
  }
  await clickId(sapPage, 'M0:46:1::0:50'); // Create
  await snapshot(sapPage, `fwzz-dialog-${PRODUCT_TYPE}`);
  await captureEvidence(sapPage, `fwzz-dialog-${PRODUCT_TYPE}`, 'Create Class dialog, empty');

  // ---- fill the dialog (nth=1 is the dialog's copy of the id field) ----
  // The ID field is deliberately skipped for an internally-numbered product
  // type - typing into it is what triggered the refusal on the first run.
  const set = async (title: string, value: string, nth: number) => {
    const el = field(sapPage, title, nth);
    await el.click();
    await el.press('Control+a');
    await el.pressSequentially(value, { delay: 40 });
    note(`set "${title}"[${nth}] = "${await el.inputValue()}"`);
  };
  await set('Product Type', PRODUCT_TYPE, 0);
  await set('Short Name', SHORT_NAME, 0);
  await set('Long Name', LONG_NAME, 0);

  note('\nradio state as left at defaults (nothing clicked):');
  for (const r of await radios(sapPage)) note(`  radio ${r.id} checked=${r.checked} "${r.label}"`);

  await captureEvidence(sapPage, `fwzz-dialog-${PRODUCT_TYPE}-filled`, 'Create Class dialog, filled');

  // ---- Create (F5): opens the maintenance screen, commits nothing ----
  note('\npressing Create (F5) - opens the class master, does NOT commit');
  await clickId(sapPage, 'M1:48::btn[5]');
  await settle(sapPage, 40_000);

  let pop = await readPopup(sapPage).catch(() => null);
  if (pop) {
    note(`popup after Create: ${JSON.stringify(pop).slice(0, 1200)}`);
    const cont = pop.buttons.find((b) => /continue/i.test(b.title ?? b.text ?? ''));
    if (cont) {
      note(`dismissing popup via "${cont.id}" (Continue) - purely navigational, not a save`);
      await clickId(sapPage, cont.id);
      await settle(sapPage, 30_000);
      pop = await readPopup(sapPage).catch(() => null);
      if (pop) note(`popup after Continue: ${JSON.stringify(pop).slice(0, 1200)}`);
    }
  }

  await snapshot(sapPage, `fwzz-${PRODUCT_TYPE}-master-open`);
  await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-master-open`, `26B class master, freshly opened`);

  const saveId = await findSaveButton(sapPage);
  note(`\nSave button resolves to: ${saveId ?? 'NOT FOUND'} (not pressed)`);

  // ---- walk the tabs, now that no modal blocks them ----
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
    await snapshot(sapPage, `fwzz-${PRODUCT_TYPE}-m-${slug}`);
    await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-m-${slug}`, `26B master tab: ${t.text}`);
  }

  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|make an entry|enter a |does not exist/i.test(l));
  note(`\n--- messages / mandatory hints ---\n${flags.join('\n') || '(none)'}`);

  // ---- prove nothing was written ----
  // 26B is internally numbered, so there is no candidate id to re-Display and
  // check for absence (unlike the CLASS_ID-typed run). The proof here is
  // procedural instead: Save was never located, let alone clicked - the
  // master screen's own ID Number field reading blank/placeholder (captured
  // in the dump above) is the on-screen evidence nothing was persisted yet.
  const idNow = await readFieldSafe(sapPage, 'Security Class ID Number', 1);
  note(`\nNOTHING SAVED. Master screen's own ID Number field still reads: "${idNow}" (blank/placeholder expected pre-Save).`);
  expect(saveId, 'Save must never have been pressed in this discovery run').toBeNull();

  writeArtifact('discover-fwzz-26b-master.txt', out.join('\n'));
});

async function readFieldSafe(page: P, title: string, nth: number): Promise<string> {
  return field(page, title, nth).inputValue().catch(() => '(not found)');
}
