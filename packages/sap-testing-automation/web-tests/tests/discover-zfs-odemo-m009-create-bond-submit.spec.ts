import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY discovery: fills the "Create Bond" panel (bc-* fields) with the
 * data confirmed by the user, WITHOUT clicking bc-submit-btn, then inspects
 * what handler is actually bound to that button/form - specifically whether
 * it opens a review/confirm dialog first (like Create Issuance's
 * openCreateIssuancePopup -> "Confirm, Create Issuance") or commits directly
 * on click, the way ZFS_ODEMO_M006's submit-btn did. Knowing which shape it
 * is decides how the real write spec has to be built and confirmed.
 *
 * Nothing here clicks bc-submit-btn.
 */

const DATA = {
  cocode: '9803',
  shortName: 'SSN - Jul 29',
  longName: '5.625 Senior Secured Notes - Jul 29',
  isin: 'USN8106HAA16',
  faceValue: '1000',
  startDate: '11072024',
  endDate: '11072029',
  currency: 'USD',
};

const log: string[] = [];
function note(line: string) {
  log.push(line);
  console.log(line);
}

test('DISCOVERY: ZFS_ODEMO_M009 Create Bond submit handler', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(5000);

  const frame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) throw new Error('Bond Workbench app frame not found');

  // Company Code autocomplete - click, type, pick the option.
  await frame.locator('#bc-cocode').click();
  await frame.locator('#bc-cocode').type(DATA.cocode, { delay: 60 });
  await sapPage.waitForTimeout(1000);
  const cocodeOption = frame.locator('#bc-cocode-drop >> text=' + DATA.cocode).first();
  await cocodeOption.click().catch((e) => note(`cocode option click failed: ${e}`));
  const cocodeHidden = await frame.locator('#bc-cocode-hidden').inputValue().catch(() => '(not found)');
  note(`bc-cocode-hidden after picking ${DATA.cocode}: "${cocodeHidden}"`);

  await frame.locator('#bc-shortname').fill(DATA.shortName);
  await frame.locator('#bc-longname').fill(DATA.longName);
  await frame.locator('#bc-isin').fill(DATA.isin);
  await frame.locator('#bc-facevalue').fill(DATA.faceValue);

  await frame.locator('#bc-startdate').click({ force: true });
  await frame.locator('#bc-startdate').type(DATA.startDate, { delay: 40 });
  await frame.locator('#bc-enddate').click({ force: true });
  await frame.locator('#bc-enddate').type(DATA.endDate, { delay: 40 });

  await frame.locator('#bc-currency').selectOption(DATA.currency);

  const filled = await frame.evaluate(() => {
    const v = (id: string) =>
      (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? null;
    return {
      cocode_visible: v('bc-cocode'), cocode_hidden: v('bc-cocode-hidden'),
      prodtype_hidden: v('bc-prodtype-hidden'),
      shortname: v('bc-shortname'), longname: v('bc-longname'), isin: v('bc-isin'),
      facevalue: v('bc-facevalue'),
      startdate: v('bc-startdate'), enddate: v('bc-enddate'),
      currency: v('bc-currency'),
    };
  });
  note(`FORM AS FILLED (not submitted):\n${JSON.stringify(filled, null, 2)}`);

  // Inspect what actually happens on submit, without triggering it: look at
  // the form element's own submit listeners are opaque to JS introspection,
  // but the button/onclick and any global function named like the M006/M009
  // issuance pattern are readable.
  const handlerProbe = await frame.evaluate(() => {
    const btn = document.getElementById('bc-submit-btn');
    const form = btn?.closest('form');
    const w = window as any;
    const candidateFnNames = [
      'submitBondCreate', 'createBondViaOData', 'buildBondPayload',
      'openCreateBondPopup', 'openBondReviewPopup', 'createBond',
    ];
    const found: Record<string, string> = {};
    for (const name of candidateFnNames) {
      if (typeof w[name] === 'function') found[name] = w[name].toString();
    }
    // Broaden the net: any global function whose name mentions "bond" (case
    // insensitive) - createBond() may delegate to a differently-named helper
    // for the actual persistence call.
    const broad: Record<string, string> = {};
    for (const key of Object.getOwnPropertyNames(w)) {
      try {
        if (/bond/i.test(key) && typeof w[key] === 'function' && !(key in found)) {
          broad[key] = w[key].toString();
        }
      } catch {
        // ignore inaccessible properties
      }
    }
    return {
      btnOuterHtml: btn?.outerHTML ?? null,
      btnType: btn?.getAttribute('type') ?? null,
      formId: form?.id ?? null,
      formOnsubmit: form?.getAttribute('onsubmit') ?? null,
      globalFunctionsFound: found,
      broadBondFunctions: broad,
    };
  });
  note(`submit handler probe:\n${JSON.stringify(handlerProbe, null, 2)}`);

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'discover-zfs-odemo-m009-create-bond-filled.png'), fullPage: true });
  writeFileSync(resolve(repoRoot, 'results', 'web', 'discover-zfs-odemo-m009-create-bond-submit-log.txt'), log.join('\n'), 'utf8');

  expect(true).toBe(true);
});
