import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * TC-010 - ZFS_ODEMO_M009 Bond Workbench: create a bond issuance (ITS WebGUI).
 *
 * WRITES TO THE DATABASE. Clicking "Confirm, Create Issuance" commits one new
 * issuance transaction against Bond Class 200194 on DS4/100. Confirmed by the
 * human before the run.
 *
 * Discovered via discover-zfs-odemo-m009*.spec.ts:
 * - "Create Issuance" only enables for a Bond Class with NO existing issuance
 *   (data-trans-no empty on its row checkbox). Class 200216 (the first one
 *   considered) already has an issuance and was rejected for that reason -
 *   200194 was confirmed as an unissued class instead.
 * - bt-classid / bt-currency-hidden are pre-filled from the selected row, not
 *   typed - there is no autocomplete to drive here.
 * - bt-placement is readonly and auto-derives as units x price. Confirmed with
 *   the human that 5,000 units x 100.00 = 500,000.00 (0.50 M), not the 5.00 M
 *   first stated.
 * - The Confirm/Cancel buttons in the review dialog carry no id - addressed by
 *   role + exact text ("Cancel" / "Confirm, Create Issuance").
 */

const DATA = {
  classId: '200194',
  issuanceDateDigits: '15082026', // typed as digits; autoSlashDate formats to DD-MM-YYYY
  issuanceDateExpected: '15-08-2026',
  units: '5000',
  price: '100.00',
  expectedPlacement: 500000, // 5,000 x 100.00
};

const log: string[] = [];
function note(line: string) {
  log.push(line);
  console.log(line);
}

function parseNumber(s: string): number {
  return Number(s.replace(/[^0-9.-]/g, ''));
}

test('TC-010 create a bond issuance with valid mock data', async ({ sapPage }) => {
  test.setTimeout(180_000);

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(5000);

  const frame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) throw new Error('Bond Workbench app frame not found');

  // Find the target class reliably via search, not pagination/page-size.
  await frame.locator('#bc-search').fill(DATA.classId);
  await frame.getByRole('button', { name: 'Search', exact: true }).click();
  await sapPage.waitForTimeout(1000);

  const row = frame.locator('tr', { hasText: DATA.classId }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  const checkbox = row.locator('input.bc-issuance-select');
  const beforeTransNo = (await checkbox.getAttribute('data-trans-no')) ?? '';
  note(`Class ${DATA.classId} data-trans-no BEFORE: "${beforeTransNo}"`);
  if (beforeTransNo.trim() !== '') {
    throw new Error(
      `Refusing to proceed - class ${DATA.classId} already has issuance Trans No ${beforeTransNo}. ` +
        `Create Issuance is only valid for a class with no existing issuance.`,
    );
  }

  await checkbox.click();
  await sapPage.waitForTimeout(500);

  const issuanceBtn = frame.locator('#bc-create-issuance-btn');
  await expect(issuanceBtn).toBeEnabled({ timeout: 10_000 });
  await issuanceBtn.click();
  await sapPage.waitForTimeout(1000);

  const classInput = frame.locator('#bt-classid');
  await expect(classInput).toBeVisible({ timeout: 15_000 });

  // Pre-filled from the row selection - verify, do not type.
  const prefilledClassId = await frame.locator('#bt-classid-hidden').inputValue();
  const prefilledCurrency = await frame.locator('#bt-currency-hidden').inputValue();
  note(`panel pre-fill: classId="${prefilledClassId}" currency="${prefilledCurrency}"`);
  if (prefilledClassId !== DATA.classId) {
    throw new Error(`Panel pre-filled classId "${prefilledClassId}", expected "${DATA.classId}"`);
  }

  await frame.locator('#bt-issuancedate').click({ force: true });
  await frame.locator('#bt-issuancedate').type(DATA.issuanceDateDigits, { delay: 60 });

  await frame.locator('#bt-units').click();
  await frame.locator('#bt-units').fill('');
  await frame.locator('#bt-units').type(DATA.units, { delay: 40 });

  await frame.locator('#bt-price').click();
  await frame.locator('#bt-price').fill('');
  await frame.locator('#bt-price').type(DATA.price, { delay: 40 });
  await frame.locator('#bt-price').evaluate((el) => (el as HTMLInputElement).blur());
  await sapPage.waitForTimeout(800);

  const filled = {
    classId: prefilledClassId,
    currency: prefilledCurrency,
    issuanceDate: await frame.locator('#bt-issuancedate').inputValue(),
    units: await frame.locator('#bt-units').inputValue(),
    price: await frame.locator('#bt-price').inputValue(),
    placement: await frame.locator('#bt-placement').inputValue(),
  };
  note(`FORM AS FILLED:\n${JSON.stringify(filled, null, 2)}`);

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'tc-010-form-filled.png'), fullPage: true });

  // Gate: never submit a form that is missing a required value, or whose
  // auto-derived placement does not match what was authorised.
  const required: [string, string][] = [
    ['classId', filled.classId],
    ['issuanceDate', filled.issuanceDate],
    ['units', filled.units],
    ['price', filled.price],
  ];
  const missing = required.filter(([, val]) => !val || val.trim() === '');
  if (missing.length > 0) {
    throw new Error(`Refusing to submit - required fields empty: ${missing.map(([k]) => k).join(', ')}`);
  }
  expect(filled.issuanceDate).toBe(DATA.issuanceDateExpected);
  expect(parseNumber(filled.units)).toBe(Number(DATA.units));
  expect(parseNumber(filled.price)).toBe(Number(DATA.price));
  expect(parseNumber(filled.placement)).toBe(DATA.expectedPlacement);

  await frame.locator('#bt-submit-btn').click();
  await sapPage.waitForTimeout(1000);

  const reviewText = await frame.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.modal-card')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const card = cards.find((el) => /Review Bond Issuance/.test(el.textContent ?? '')) ?? cards[0];
    return (card?.textContent ?? '').replace(/\s+/g, ' ').trim();
  });
  note(`REVIEW DIALOG:\n${reviewText}`);
  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'tc-010-review-dialog.png'), fullPage: true });

  if (!/Confirm, Create Issuance/.test(reviewText)) {
    throw new Error('Review dialog did not render as expected - refusing to confirm. See tc-010-review-dialog.png');
  }

  // ---- THE WRITE ----
  note('Confirming issuance creation - this commits to DS4/100.');
  await frame.getByRole('button', { name: 'Confirm, Create Issuance', exact: true }).click();

  // The OData call behind this takes longer than the ITS round trip that
  // follows it, and can detach the frame handle mid-flight (measured: the
  // first attempt at this case crashed here with "Frame was detached", same
  // trap TC-001 documents). Re-find the frame from sapPage on every poll
  // rather than reusing `frame`, and give the call room to finish.
  await sapPage.waitForTimeout(6000);
  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'tc-010-after-confirm.png'), fullPage: true });

  const findFrame = () => sapPage.frames().find((f) => f.url().includes('HTML000001.htm')) ?? null;

  const doneBtn = findFrame()?.getByRole('button', { name: 'Done', exact: true });
  if (doneBtn && (await doneBtn.count().catch(() => 0))) {
    await doneBtn.click().catch((e) => note(`click on Done failed (non-fatal): ${e}`));
    note('Clicked Done.');
    await sapPage.waitForTimeout(1000);
  } else {
    note('No "Done" button found after confirm - see tc-010-after-confirm.png for whatever appeared.');
  }

  writeFileSync(resolve(repoRoot, 'results', 'web', 'tc-010-run-log.txt'), log.join('\n'), 'utf8');

  // The assertion that matters: the issuance must actually exist afterwards.
  // Re-find the frame and retry the search+read once if the handle goes
  // stale mid-step, rather than reusing a single frame reference throughout.
  let after: { transNo: string; units: string; price: string } | null = null;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3 && !after; attempt++) {
    try {
      const vf = findFrame();
      if (!vf) throw new Error('app frame not present for verification');

      await vf.locator('#bc-search').fill(DATA.classId);
      await vf.getByRole('button', { name: 'Search', exact: true }).click();
      await sapPage.waitForTimeout(1500);

      const vf2 = findFrame() ?? vf;
      const verifyRow = vf2.locator('tr', { hasText: DATA.classId }).first();
      await expect(verifyRow).toBeVisible({ timeout: 15_000 });
      const verifyCheckbox = verifyRow.locator('input.bc-issuance-select');

      after = {
        transNo: (await verifyCheckbox.getAttribute('data-trans-no')) ?? '',
        units: (await verifyCheckbox.getAttribute('data-no-of-units')) ?? '',
        price: (await verifyCheckbox.getAttribute('data-issuance-price')) ?? '',
      };
    } catch (e) {
      lastErr = e;
      note(`verification attempt ${attempt} failed: ${e}`);
      await sapPage.waitForTimeout(2000);
    }
  }
  if (!after) throw new Error(`could not verify post-write state after 3 attempts: ${lastErr}`);

  note(`AFTER: trans-no="${after.transNo}" units="${after.units}" price="${after.price}"`);
  writeFileSync(resolve(repoRoot, 'results', 'web', 'tc-010-run-log.txt'), log.join('\n'), 'utf8');

  expect(after.transNo.trim(), 'class 200194 should now carry an issuance Trans No').not.toBe('');
  expect(parseNumber(after.units)).toBe(Number(DATA.units));
  expect(parseNumber(after.price)).toBe(Number(DATA.price));
});
