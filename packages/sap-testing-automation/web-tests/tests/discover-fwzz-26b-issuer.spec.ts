import { test, expect } from '../fixtures';
import {
  openTransaction, screenInfo, dumpScreen, settle, writeArtifact,
  captureEvidence, bodyText, field, readPopup, statusMessage,
  openValueHelp, readSearchHelp, closeValueHelp, setField,
} from '../webgui';

/**
 * READ-ONLY discovery, part 4: what "Issuer" on the 26B Basic Data tab
 * actually wants, and the tabs behind it.
 *
 * Part 3 (discover-fwzz-26b-master.spec.ts) found the class master opens on
 * "Basic Data" for an internally-numbered product type, and every other tab
 * (Conditions, Exchanges, Security Swap, Regulatory Reporting, User Data)
 * refuses to render until "Issuer" (control id ...3B257::1:20, labelled
 * "Issuer Identity Key" on screen) is filled - SAP blocks the tab switch with
 * "Make an entry in mandatory field \"Issuer\"" instead of silently losing
 * the value. This does not guess an issuer id; it reads the field's own F4.
 *
 * WRITES NOTHING. Never reaches Save.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const PRODUCT_TYPE = process.env.PRODUCT_TYPE ?? '26B';
const SHORT_NAME = process.env.SHORT_NAME ?? 'NIFTY50 IDX FUN';
const LONG_NAME = process.env.LONG_NAME ?? 'NIIF Nifty 50 Index Fund - Growth';
const ID_FIELD = 'Security Class ID Number';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

type P = import('@playwright-sap/test').Page;

async function clickId(page: P, id: string) {
  await page.locator(`[id="${id}"]`).first().click({ timeout: 20_000 });
  await settle(page, 30_000);
}

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
        value: (e.value ?? '').slice(0, 60),
      })),
  );
}

async function snapshot(page: P, name: string) {
  const info = await screenInfo(page);
  note(`\n===== ${name} ===== ${JSON.stringify(info)}`);
  note(`status: "${await statusMessage(page).catch(() => '?')}"`);
  await dumpScreen(page, name, { full: true });
  for (const i of await inputDetail(page)) {
    note(`  input ${i.id.padEnd(24)} "${i.title}" = "${i.value}"`);
  }
}

test(`DISCOVER: FWZZ ${PRODUCT_TYPE} - Issuer F4 and tabs behind it`, async ({ sapPage }) => {
  test.setTimeout(900_000);

  await openTransaction(sapPage, 'FWZZ');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');
  note(`session: ${JSON.stringify(info)}`);

  // ---- reach Basic Data, same route as part 3 ----
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
    if (cont) {
      await clickId(sapPage, cont.id);
    }
  }
  await snapshot(sapPage, `fwzz-${PRODUCT_TYPE}-search-terms-empty`);

  // The master opens on "Search Terms" (part 3's finding) - Issuer lives on
  // "Basic Data", so switch there before touching it.
  await clickId(sapPage, 'M0:46:2::0:1-title'); // Basic Data tab
  await snapshot(sapPage, `fwzz-${PRODUCT_TYPE}-basic-data-empty`);

  // ---- F4 the Issuer Identity Key field ----
  const issuerTitle = 'Issuer Identity Key';
  await openValueHelp(sapPage, issuerTitle).catch(async (e) => {
    note(`openValueHelp("${issuerTitle}") failed: ${e}`);
  });
  await settle(sapPage, 20_000);
  let help = await readSearchHelp(sapPage).catch(() => null);
  note(`\nIssuer Identity Key F4, default filter: ${help ? `${help.rows.length} rows (of ${help.total})` : 'unreadable'}`);

  // 0 rows can mean "no issuers exist" or "a default filter matches nothing" -
  // probe-security-class.spec.ts found the latter on a different field. Clear
  // every filter input in the dialog and press Go before concluding either way.
  if (help && help.rows.length === 0) {
    note('clearing all filter fields in the dialog and pressing Go');
    const filterIds = await sapPage.evaluate(() => {
      const dialog = Array.from(document.querySelectorAll('[id^="SearchHelp"][role="dialog"]')).find(
        (d) => d.getBoundingClientRect().width > 0,
      );
      return dialog ? Array.from(dialog.querySelectorAll('input')).map((i) => i.id) : [];
    });
    for (const id of filterIds) {
      const loc = sapPage.locator(`[id="${id}"]`);
      await loc.click().catch(() => {});
      await loc.press('Control+a').catch(() => {});
      await loc.press('Delete').catch(() => {});
    }
    await sapPage.evaluate(() => {
      const dialog = Array.from(document.querySelectorAll('[id^="SearchHelp"][role="dialog"]')).find(
        (d) => d.getBoundingClientRect().width > 0,
      );
      const go = dialog
        ? (Array.from(dialog.querySelectorAll('[role="button"]')).find((b) => /go/i.test(b.textContent ?? '')) as HTMLElement | null)
        : null;
      go?.click();
    });
    await settle(sapPage, 20_000);
    help = await readSearchHelp(sapPage).catch(() => null);
    note(`after clearing filters + Go: ${help ? `${help.rows.length} rows (of ${help.total})` : 'unreadable'}`);
  }

  if (help) {
    note(`\nIssuer Identity Key F4: ${help.rows.length} rows (of ${help.total})`);
    for (const r of help.rows.slice(0, 30)) note(`  ${r.join(' | ')}`);
    await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-issuer-f4`, 'Issuer Identity Key F4 results');
    await closeValueHelp(sapPage).catch(() => {});
  } else {
    note('\nIssuer Identity Key F4 produced no readable search help - see screenshot');
    await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-issuer-f4-empty`, 'Issuer F4 attempt');
  }

  // ---- if a candidate came back, fill it and try to walk the remaining tabs ----
  const candidate = help?.rows?.[0]?.[0];
  if (candidate) {
    note(`\ntrying first F4 candidate as Issuer Identity Key: "${candidate}"`);
    await setField(sapPage, issuerTitle, candidate, 0);
    await sapPage.keyboard.press('Enter');
    await settle(sapPage, 20_000);
    await snapshot(sapPage, `fwzz-${PRODUCT_TYPE}-basic-data-issuer-set`);

    const tabs = await sapPage.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]'))
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => ({ id: e.id, text: (e.textContent ?? '').trim() })),
    );
    for (const t of tabs) {
      if (!t.id) continue;
      await sapPage.locator(`[id="${t.id}"]`).click({ timeout: 15_000 }).catch(() => {});
      await settle(sapPage, 20_000);
      const slug = (t.text || t.id).replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 40);
      await snapshot(sapPage, `fwzz-${PRODUCT_TYPE}-tab2-${slug}`);
      await captureEvidence(sapPage, `fwzz-${PRODUCT_TYPE}-tab2-${slug}`, `26B master tab (issuer set): ${t.text}`);
    }
  } else {
    note('\nno F4 candidate available - cannot progress past the Issuer gate this run');
  }

  const text = await bodyText(sapPage);
  const flags = text.split('\n').map((l) => l.trim())
    .filter((l) => /required|mandatory|fill the following|make an entry|enter a /i.test(l));
  note(`\n--- mandatory hints on final screen ---\n${flags.join('\n') || '(none)'}`);

  note('\nNOTHING SAVED. Save was never located or pressed in this run.');
  writeArtifact('discover-fwzz-26b-issuer.txt', out.join('\n'));
});
