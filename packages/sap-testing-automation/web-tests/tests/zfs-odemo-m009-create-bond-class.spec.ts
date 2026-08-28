import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * TC-011 - ZFS_ODEMO_M009 Bond Workbench: create a new Bond Class (ITS WebGUI).
 *
 * WRITES TO THE DATABASE. Clicking "Create Bond" commits one new Bond Class
 * on DS4/100. Confirmed by the human before the run.
 *
 * Discovered via discover-zfs-odemo-m009-create-bond-submit.spec.ts:
 * - Unlike Create Issuance, there is NO review/confirm dialog here.
 *   `#bc-submit-btn` is `type="submit"` on a form whose `onsubmit` directly
 *   calls `createBond()` - passing validation submits immediately.
 * - `createBond()`'s own in-memory `record.classId` is a client-side
 *   placeholder `"NEW-"+seq`, used only by an offline/browser-preview
 *   fallback branch. The real, persisted Class ID is server-assigned and only
 *   knowable by re-reading the register afterwards - this spec diffs the
 *   full set of Class IDs before/after rather than trusting anything
 *   client-side, the same rigor TC-001 applies after ZFS_ODEMO_M006's D1.
 * - Short Name / Long Name / ISIN / Face Value / Currency / Start&End Date
 *   were mirrored from existing Class 200216 at the user's request, including
 *   its ISIN - confirmed as intentional, this register already tolerates
 *   duplicate ISINs (e.g. 200210-200212 all share ISIN1234).
 */

const DATA = {
  cocode: { search: '9803', expectHidden: '9803' },
  shortName: 'SSN - Jul 29',
  longName: '5.625 Senior Secured Notes - Jul 29',
  isin: 'USN8106HAA16',
  faceValue: '1000',
  startDateDigits: '11072024',
  startDateExpected: '11-07-2024',
  endDateDigits: '11072029',
  endDateExpected: '11-07-2029',
  currency: 'USD',
};

const log: string[] = [];
function note(line: string) {
  log.push(line);
  console.log(line);
}

async function collectClassIds(frame: import('@playwright-sap/test').Frame): Promise<Set<string>> {
  const ids = await frame.evaluate(() =>
    Array.from(document.querySelectorAll('input.bc-issuance-select')).map(
      (b) => b.getAttribute('data-class-id') ?? '',
    ),
  );
  return new Set(ids.filter(Boolean));
}

test('TC-011 create a Bond Class with valid mock data', async ({ sapPage }) => {
  test.setTimeout(180_000);

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(5000);

  const findFrame = () => sapPage.frames().find((f) => f.url().includes('HTML000001.htm')) ?? null;
  const frame = findFrame();
  if (!frame) throw new Error('Bond Workbench app frame not found');

  await frame.locator('#bc-page-size').selectOption('50');
  await sapPage.waitForTimeout(1000);
  const beforeIds = await collectClassIds(frame);
  note(`Class IDs BEFORE (${beforeIds.size}): ${JSON.stringify([...beforeIds].sort())}`);

  const totalsBefore = await frame.evaluate(() => {
    const t = document.body.innerText;
    return { totalBonds: t.match(/Total Bonds\s*\n\s*(\d+)/)?.[1] ?? '?' };
  });
  note(`Total Bonds BEFORE: ${totalsBefore.totalBonds}`);

  await frame.locator('#bc-cocode').click();
  await frame.locator('#bc-cocode').fill('');
  await frame.locator('#bc-cocode').type(DATA.cocode.search, { delay: 60 });
  await sapPage.waitForTimeout(1000);
  const cocodeOption = frame.locator('#bc-cocode-drop >> text=' + DATA.cocode.search).first();
  await cocodeOption.click();
  const cocodeHidden = await frame.locator('#bc-cocode-hidden').inputValue();
  note(`bc-cocode-hidden after picking ${DATA.cocode.search}: "${cocodeHidden}"`);
  if (!cocodeHidden.includes(DATA.cocode.expectHidden)) {
    throw new Error(
      `Company Code autocomplete did not commit: bc-cocode-hidden = "${cocodeHidden}", expected to contain "${DATA.cocode.expectHidden}"`,
    );
  }

  await frame.locator('#bc-shortname').fill(DATA.shortName);
  await frame.locator('#bc-longname').fill(DATA.longName);
  await frame.locator('#bc-isin').fill(DATA.isin);
  await frame.locator('#bc-facevalue').fill(DATA.faceValue);

  await frame.locator('#bc-startdate').click({ force: true });
  await frame.locator('#bc-startdate').type(DATA.startDateDigits, { delay: 40 });
  await frame.locator('#bc-enddate').click({ force: true });
  await frame.locator('#bc-enddate').type(DATA.endDateDigits, { delay: 40 });

  await frame.locator('#bc-currency').selectOption(DATA.currency);

  const filled = await frame.evaluate(() => {
    const v = (id: string) =>
      (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? null;
    return {
      cocode_hidden: v('bc-cocode-hidden'),
      shortname: v('bc-shortname'),
      longname: v('bc-longname'),
      isin: v('bc-isin'),
      facevalue: v('bc-facevalue'),
      startdate: v('bc-startdate'),
      enddate: v('bc-enddate'),
      currency: v('bc-currency'),
    };
  });
  note(`FORM AS FILLED:\n${JSON.stringify(filled, null, 2)}`);

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'tc-011-form-filled.png'), fullPage: true });

  // Gate: never submit a form that is missing a required value.
  const required: [string, string | null][] = [
    ['cocode_hidden', filled.cocode_hidden],
    ['shortname', filled.shortname],
    ['longname', filled.longname],
    ['isin', filled.isin],
    ['facevalue', filled.facevalue],
    ['startdate', filled.startdate],
    ['enddate', filled.enddate],
  ];
  const missing = required.filter(([, val]) => !val || val.trim() === '');
  if (missing.length > 0) {
    throw new Error(`Refusing to submit - required fields empty: ${missing.map(([k]) => k).join(', ')}`);
  }
  expect(filled.startdate).toBe(DATA.startDateExpected);
  expect(filled.enddate).toBe(DATA.endDateExpected);

  // ---- THE WRITE ----
  //
  // No review dialog exists for this path (see discovery notes above) -
  // clicking Create Bond is itself the commit.
  note('Creating Bond Class - this commits to DS4/100.');
  await frame.locator('#bc-submit-btn').click();

  // The form submit shows a "Class ID Created Successfully" dialog and drives
  // a real ITS round trip in the background. Reusing the old frame handle
  // through that (even re-finding it by URL) proved flaky - measured: the
  // success dialog and updated register were plainly visible on screen while
  // sapPage.frames() repeatedly failed to return a matching frame for several
  // seconds. A completely fresh navigation + search, the same approach the
  // read-only verification specs use, was reliable every time it was tried
  // afterwards - so verify that way instead of fighting the live frame.
  await sapPage.waitForTimeout(4000);
  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'tc-011-after-submit.png'), fullPage: true });
  writeFileSync(resolve(repoRoot, 'results', 'web', 'tc-011-run-log.txt'), log.join('\n'), 'utf8');

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await sapPage.waitForTimeout(6000);

  const vf = findFrame();
  if (!vf) throw new Error('app frame not present after re-navigation for verification');

  await vf.locator('#bc-page-size').selectOption('50');
  await sapPage.waitForTimeout(1500);
  const afterIds = await collectClassIds(vf);
  const newIds = [...afterIds].filter((id) => !beforeIds.has(id));
  const totalsAfter = await vf.evaluate(() => {
    const t = document.body.innerText;
    return { totalBonds: t.match(/Total Bonds\s*\n\s*(\d+)/)?.[1] ?? '?' };
  });
  note(`Class IDs AFTER count=${afterIds.size}, new=${JSON.stringify(newIds)}, totalBonds=${totalsAfter.totalBonds}`);

  if (newIds.length === 0) {
    throw new Error('no new Class ID found after re-navigation - the write may not have persisted');
  }
  if (newIds.length > 1) {
    note(`WARNING: more than one new Class ID appeared: ${JSON.stringify(newIds)} - taking the first for field verification`);
  }
  const newClassId = newIds[0];
  note(`New Class ID: ${newClassId}`);
  expect(newClassId, 'new Class ID must not be the client-side offline-preview placeholder').not.toMatch(/^NEW-/);

  const newRowDetail = await vf.evaluate((classId) => {
    const cb = Array.from(document.querySelectorAll('input.bc-issuance-select')).find(
      (b) => b.getAttribute('data-class-id') === classId,
    ) as HTMLInputElement | undefined;
    if (!cb) return null;
    return {
      shortName: cb.getAttribute('data-short-name'),
      isin: cb.getAttribute('data-isin'),
      faceValue: cb.getAttribute('data-face-value'),
      currency: cb.getAttribute('data-currency'),
    };
  }, newClassId);
  note(`New row detail: ${JSON.stringify(newRowDetail)}`);

  writeFileSync(resolve(repoRoot, 'results', 'web', 'tc-011-run-log.txt'), log.join('\n'), 'utf8');

  expect(newRowDetail?.shortName).toBe(DATA.shortName);
  expect(newRowDetail?.isin).toBe(DATA.isin);
  expect(Number(newRowDetail?.faceValue)).toBe(Number(DATA.faceValue));
  expect(newRowDetail?.currency).toBe(DATA.currency);
  expect(totalsAfter.totalBonds).toBe(String(Number(totalsBefore.totalBonds) + 1));
});
