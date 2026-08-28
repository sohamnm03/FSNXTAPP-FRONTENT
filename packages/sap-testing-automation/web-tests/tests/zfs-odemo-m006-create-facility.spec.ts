import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Frame } from '@playwright-sap/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * TC-001 - ZFS_ODEMO_M006 Facility Creation (ITS WebGUI).
 *
 * WRITES TO THE DATABASE. Clicking "Create Facility" commits one facility on
 * DS4/100. Confirmed by the human before the run.
 *
 * The company code / partner / product type / currency fields are custom
 * autocompletes: the visible `i-*` input is display text only, and the value
 * that gets posted lives in a sibling hidden `h-*` input that is only set when
 * an option is clicked. Typing alone leaves the hidden field empty, so every
 * pick is verified against `h-*` and the submit is refused if any required
 * value is missing.
 */

const DATA = {
  cocode: { search: '9803', expectHidden: '9803', label: 'Company Code' },
  partner: { search: '9800', expectHidden: '9800', label: 'Business Partner' },
  prdtype: { search: 'ICF', expectHidden: 'ICF', label: 'Product Type' },
  currency: { search: 'USD', expectHidden: 'USD', label: 'Currency' },
  facname: 'TEST FACILITY CLAUDE 001',
  startDate: '01092026', // typed as digits; autoSlashDate formats to DD-MM-YYYY
  endDate: '31082027',
  limitAmount: '5000000',
  intcat: 'F',
  intsubcat: '01',
  icm: '2',
  repaytype: 'F',
  freq: 'Q',
  intrate: '7.25',
};

const log: string[] = [];
function note(line: string) {
  log.push(line);
  console.log(line);
}

/** Fill a custom autocomplete by clicking a real option, not by typing text. */
async function pickAutocomplete(
  frame: Frame,
  key: string,
  search: string,
  expectHidden: string,
) {
  const input = frame.locator(`#i-${key}`);
  const list = frame.locator(`#d-${key}`);

  await input.click();
  await input.fill('');
  await input.type(search, { delay: 60 });

  // Wait for the dropdown to actually render options.
  await expect(list.locator('> *').first()).toBeVisible({ timeout: 10_000 });

  const options = await list.locator('> *').allTextContents();
  note(`  ${key}: options offered -> ${JSON.stringify(options.slice(0, 8))}`);

  const match = list.locator('> *', { hasText: search }).first();
  await match.click();

  const shown = await input.inputValue();
  const hidden = await frame.locator(`#h-${key}`).inputValue();
  note(`  ${key}: visible="${shown}" hidden="${hidden}"`);

  if (!hidden.includes(expectHidden)) {
    throw new Error(
      `Autocomplete '${key}' did not commit a value: hidden field h-${key} = '${hidden}', ` +
        `expected to contain '${expectHidden}'. Refusing to submit a partial record.`,
    );
  }
}

test('TC-001 create a facility with valid mock data', async ({ sapPage }) => {
  test.setTimeout(180_000);

  // A confirm() on submit would otherwise hang the run. The write itself is
  // already human-confirmed; log whatever the app asks and accept it.
  sapPage.on('dialog', async (d) => {
    note(`DIALOG (${d.type()}): ${d.message()}`);
    await d.accept();
  });

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M006`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(5000);

  const frame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) throw new Error('Facility app frame not found');

  await expect(frame.locator('#submit-btn')).toBeVisible({ timeout: 30_000 });

  // Record the register state before the write so the new row is identifiable.
  const beforeRows = await frame.locator('table tbody tr').allTextContents();
  note(`Register BEFORE: ${beforeRows.length} rows`);
  note(`  top row: ${beforeRows[0]?.replace(/\s+/g, ' ').trim() ?? '(none)'}`);

  note('Filling facility details:');
  await pickAutocomplete(frame, 'cocode', DATA.cocode.search, DATA.cocode.expectHidden);
  await pickAutocomplete(frame, 'partner', DATA.partner.search, DATA.partner.expectHidden);

  await frame.locator('#i-facname').fill(DATA.facname);

  await pickAutocomplete(frame, 'prdtype', DATA.prdtype.search, DATA.prdtype.expectHidden);

  // Dates: typed digit by digit so the app's autoSlashDate handler formats them.
  await frame.locator('#i-startdate').click();
  await frame.locator('#i-startdate').type(DATA.startDate, { delay: 60 });
  await frame.locator('#i-enddate').click();
  await frame.locator('#i-enddate').type(DATA.endDate, { delay: 60 });

  // Amount: formatted on input, suffix applied on blur.
  await frame.locator('#i-limitamt').click();
  await frame.locator('#i-limitamt').type(DATA.limitAmount, { delay: 40 });
  await frame.locator('#i-facname').click(); // blur to trigger applyAmountSuffix

  await pickAutocomplete(frame, 'currency', DATA.currency.search, DATA.currency.expectHidden);

  note('Filling interest details:');
  await frame.locator('#i-intcat').selectOption(DATA.intcat);
  await frame.locator('#i-intsubcat').selectOption(DATA.intsubcat);
  await frame.locator('#i-icm').selectOption(DATA.icm);
  await frame.locator('#i-repaytype').selectOption(DATA.repaytype);
  await frame.locator('#i-freq').selectOption(DATA.freq);
  await frame.locator('#i-intrate').fill(DATA.intrate);

  // Read back everything that will be posted.
  const filled = await frame.evaluate(() => {
    const v = (id: string) =>
      (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? null;
    return {
      cocode_visible: v('i-cocode'), cocode_hidden: v('h-cocode'),
      partner_visible: v('i-partner'), partner_hidden: v('h-partner'),
      facname: v('i-facname'),
      prdtype_visible: v('i-prdtype'), prdtype_hidden: v('h-prdtype'),
      startdate: v('i-startdate'), enddate: v('i-enddate'),
      limitamt: v('i-limitamt'),
      currency_visible: v('i-currency'), currency_hidden: v('h-currency'),
      intcat: v('i-intcat'), intsubcat: v('i-intsubcat'), icm: v('i-icm'),
      repaytype: v('i-repaytype'), freq: v('i-freq'), intrate: v('i-intrate'),
    };
  });
  note(`FORM AS FILLED:\n${JSON.stringify(filled, null, 2)}`);

  await sapPage.screenshot({
    path: resolve(repoRoot, 'evidence', 'tc-001-form-filled.png'),
    fullPage: true,
  });

  // Gate: never submit a form that is missing a required value.
  const required: [string, string | null][] = [
    ['h-cocode', filled.cocode_hidden],
    ['h-partner', filled.partner_hidden],
    ['i-facname', filled.facname],
    ['h-prdtype', filled.prdtype_hidden],
    ['i-startdate', filled.startdate],
    ['i-enddate', filled.enddate],
    ['i-limitamt', filled.limitamt],
    ['h-currency', filled.currency_hidden],
  ];
  const missing = required.filter(([, val]) => !val || val.trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Refusing to submit - required fields empty: ${missing.map(([k]) => k).join(', ')}`,
    );
  }
  expect(filled.startdate).toBe('01-09-2026');
  expect(filled.enddate).toBe('31-08-2027');

  // ---- THE WRITE ----
  //
  // NOT via the button. `submitFacilityCreate()` branches on
  // `isSapGuiHtmlViewer()`, which is true whenever `window.external` exists and
  // `window.sap.ui` does not - and Chromium always defines `window.external`.
  // So in WebGUI the app takes the SAP GUI branch, fires a sapevent navigation,
  // reports "Facility creation request sent to SAP TRM" and clears the form
  // while writing nothing. Verified twice: register stayed at 8 records.
  //
  // Calling the app's own OData creator is the path a correctly-detected
  // browser would take, so the backend service is still what gets exercised.
  const odataResponses: string[] = [];
  sapPage.on('response', async (r) => {
    if (!r.url().includes('zapi_fs_odemo_t006_o4')) return;
    const line = `  HTTP ${r.request().method()} ${r.status()} ${r.url().split('/').pop()}`;
    note(line);
    if (r.request().method() === 'POST') {
      odataResponses.push(`REQUEST BODY:\n${r.request().postData() ?? '(none)'}`);
      const body = await r.text().catch((e) => `(body unavailable: ${e})`);
      odataResponses.push(`RESPONSE ${r.status()} BODY:\n${body.slice(0, 3000)}`);
    }
  });

  note('Creating facility via the app OData path - this commits to DS4/100.');
  const submitResult = await frame.evaluate(async () => {
    const w = window as unknown as {
      buildFacilityPayload: () => Record<string, string>;
      createFacilityViaOData: (p: Record<string, string>) => Promise<void>;
    };
    const payload = w.buildFacilityPayload();
    await w.createFacilityViaOData(payload);
    const toast = document.querySelector('.toast, [class*="toast"]') as HTMLElement | null;
    return { payload, toast: toast?.innerText?.trim() ?? '(no toast found)' };
  });
  note(`PAYLOAD POSTED:\n${JSON.stringify(submitResult.payload, null, 2)}`);
  note(`TOAST: ${submitResult.toast}`);
  await sapPage.waitForTimeout(1500);
  note(`ODATA EXCHANGE:\n${odataResponses.join('\n')}`);

  // The frame handle goes stale the moment ITS does its round trip, so re-find
  // the app frame on every poll instead of reusing `frame`. Reading the stale
  // handle silently returns the WebGUI shell and looks like a blank result.
  for (let i = 1; i <= 12; i++) {
    await sapPage.waitForTimeout(1000);
    const f = sapPage.frames().find((fr) => fr.url().includes('HTML000001.htm'));
    if (!f) {
      note(`  t+${i}s: app frame not present (frames: ${sapPage.frames().length})`);
      continue;
    }
    const snap = await f
      .evaluate(() => {
        const body = document.body?.innerText ?? '';
        const alerts: string[] = [];
        document
          .querySelectorAll('.msg, .message, .toast, .alert, .error, .ok, [class*="msg"], [class*="toast"], [class*="alert"]')
          .forEach((el) => {
            const t = (el as HTMLElement).innerText?.trim();
            if (t) alerts.push(`${el.className}: ${t.slice(0, 200)}`);
          });
        const total = document.body.innerText.match(/TOTAL FACILITIES\s*\n\s*(\d+)/)?.[1] ?? '?';
        const records = document.body.innerText.match(/(\d+)\s+records/)?.[1] ?? '?';
        return {
          alerts,
          total,
          records,
          hasForm: !!document.getElementById('submit-btn'),
          head: body.slice(0, 300).replace(/\s+/g, ' '),
        };
      })
      .catch((e) => ({ error: String(e) }));
    note(`  t+${i}s: ${JSON.stringify(snap)}`);
  }

  await sapPage.screenshot({
    path: resolve(repoRoot, 'evidence', 'tc-001-after-submit.png'),
    fullPage: true,
  });

  writeFileSync(resolve(repoRoot, 'results', 'web', 'tc-001-run-log.txt'), log.join('\n'), 'utf8');

  // The assertion that matters: the facility must actually exist afterwards.
  // Everything above can look healthy while nothing is written - both of this
  // app's create paths do exactly that today.
  const verifyFrame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!verifyFrame) throw new Error('app frame not present for verification');

  const register = await verifyFrame.evaluate(() => ({
    text: document.body.innerText,
    records: document.body.innerText.match(/(\d+)\s+records/)?.[1] ?? '?',
  }));
  note(`Register AFTER: ${register.records} records`);

  expect(
    register.text,
    'facility should appear in the register after creation',
  ).toContain(DATA.facname);
});
