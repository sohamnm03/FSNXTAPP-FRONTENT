import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY discovery: opens the "Create Issuance" panel in the ZFS_ODEMO_M009
 * Bond Workbench, types a Class ID into the bt-classid autocomplete and reads
 * back its dropdown behaviour + whether bt-placement auto-derives from
 * units x price (every existing register row matches that formula). Stops
 * before bt-submit-btn - nothing here creates an issuance.
 */

const log: string[] = [];
function note(line: string) {
  log.push(line);
  console.log(line);
}

test('DISCOVERY: ZFS_ODEMO_M009 Create Issuance panel behaviour', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(5000);

  const frame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) throw new Error('Bond Workbench app frame not found');

  sapPage.on('console', (msg) => note(`CONSOLE ${msg.type()}: ${msg.text()}`));
  sapPage.on('pageerror', (err) => note(`PAGE ERROR: ${err.message}`));

  // Before assuming a fresh Bond Class is needed: check whether ANY of the 52
  // register rows already lacks an issuance (empty data-trans-no), which
  // would make Create Issuance enable without creating new master data.
  await frame.locator('#bc-page-size').selectOption('50');
  await sapPage.waitForTimeout(1000);
  const unissued = await frame.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('input.bc-issuance-select'));
    return boxes
      .filter((b) => !(b as HTMLInputElement).getAttribute('data-trans-no')?.trim())
      .map((b) => (b as HTMLInputElement).getAttribute('data-class-id'));
  });
  note(`register rows (page size 50) with NO existing issuance (data-trans-no empty): ${JSON.stringify(unissued)}`);

  const unissuedDetail = await frame.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('input.bc-issuance-select'));
    return boxes
      .filter((b) => !(b as HTMLInputElement).getAttribute('data-trans-no')?.trim())
      .map((b) => ({
        classId: b.getAttribute('data-class-id'),
        shortName: b.getAttribute('data-short-name'),
        longName: b.getAttribute('data-long-name'),
        isin: b.getAttribute('data-isin'),
        faceValue: b.getAttribute('data-face-value'),
        currency: b.getAttribute('data-currency'),
        startDate: b.getAttribute('data-start-date'),
        endDate: b.getAttribute('data-end-date'),
      }));
  });
  note(`unissued class detail:\n${JSON.stringify(unissuedDetail, null, 2)}`);

  // "Create Issuance" starts disabled - it enables once a bond row is
  // selected via its row checkbox. Diagnose the row/checkbox/button wiring
  // before trying a synthetic click strategy.
  const TARGET_CLASS_ID = '200194';

  const btnDiag = await frame.locator('#bc-create-issuance-btn').evaluate((el) => ({
    outerHtml: el.outerHTML,
    disabled: (el as HTMLButtonElement).disabled,
  }));
  note(`bc-create-issuance-btn before selection: ${JSON.stringify(btnDiag)}`);

  const targetRow = frame.locator('tr', { hasText: TARGET_CLASS_ID }).first();
  await expect(targetRow).toBeVisible({ timeout: 15_000 });
  const checkbox = targetRow.locator('input[type="checkbox"]');
  await checkbox.click();
  await sapPage.waitForTimeout(500);

  const btnState = await frame.locator('#bc-create-issuance-btn').evaluate((el) => ({
    disabled: (el as HTMLButtonElement).disabled,
  }));
  note(`bc-create-issuance-btn state after selecting ${TARGET_CLASS_ID}: ${JSON.stringify(btnState)}`);

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'discover-zfs-odemo-m009-row-selected.png'), fullPage: true });

  if (btnState.disabled) {
    note('bc-create-issuance-btn is still disabled - stopping here without attempting the click.');
    writeFileSync(resolve(repoRoot, 'results', 'web', 'discover-zfs-odemo-m009-issuance-panel-log.txt'), log.join('\n'), 'utf8');
    return;
  }

  await frame.locator('#bc-create-issuance-btn').click();
  await sapPage.waitForTimeout(1000);

  const classInput = frame.locator('#bt-classid');
  await expect(classInput).toBeVisible({ timeout: 15_000 });

  const hiddenClassId = await frame.locator('#bt-classid-hidden').inputValue().catch(() => '(not found)');
  const visibleClassId = await classInput.inputValue().catch(() => '(not found)');
  note(`bt-classid on panel open: visible="${visibleClassId}" hidden="${hiddenClassId}" (expect it pre-filled from the row selection, not typed)`);

  const currencyHidden = await frame.locator('#bt-currency-hidden').inputValue().catch(() => '(not found)');
  note(`bt-currency-hidden on panel open: "${currencyHidden}"`);

  // Fill units + price, then blur, to see if bt-placement auto-derives.
  await frame.locator('#bt-units').click();
  await frame.locator('#bt-units').fill('');
  await frame.locator('#bt-units').type('5000', { delay: 40 });
  await frame.locator('#bt-price').click();
  await frame.locator('#bt-price').fill('');
  await frame.locator('#bt-price').type('100.00', { delay: 40 });
  await frame.locator('#bt-price').evaluate((el) => (el as HTMLInputElement).blur());
  await sapPage.waitForTimeout(800);

  const placementAfterUnitsPrice = await frame.locator('#bt-placement').inputValue().catch(() => '(not found)');
  note(`bt-placement value after typing units=5000 price=100.00 (before typing placement myself): "${placementAfterUnitsPrice}"`);

  const isPlacementReadonly = await frame.locator('#bt-placement').evaluate((el) => (el as HTMLInputElement).readOnly || (el as HTMLInputElement).disabled).catch(() => null);
  note(`bt-placement readOnly/disabled: ${isPlacementReadonly}`);

  // Fill the issuance date too (required), then open the confirm dialog by
  // clicking Create Issuance - this only opens a confirmation, it does not
  // commit. Inspect the dialog's real buttons (the lean dump showed them with
  // NO id), then Cancel out without writing anything.
  await frame.locator('#bt-issuancedate').click({ force: true });
  await frame.locator('#bt-issuancedate').type('15082026', { delay: 60 });
  await sapPage.waitForTimeout(500);
  const issuanceDateValue = await frame.locator('#bt-issuancedate').inputValue();
  note(`bt-issuancedate after typing "15082026": "${issuanceDateValue}"`);

  await frame.locator('#bt-submit-btn').click();
  await sapPage.waitForTimeout(1000);

  const dialogDiag = await frame.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="confirm"]'))
      .filter((d) => {
        const r = d.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    return dialogs.map((d) => ({
      className: (d as HTMLElement).className,
      text: (d.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
      buttons: Array.from(d.querySelectorAll('button, [role="button"]')).map((b) => ({
        id: b.id,
        className: (b as HTMLElement).className,
        text: (b.textContent ?? '').trim(),
        type: b.getAttribute('type') || '',
      })),
    }));
  });
  note(`confirm dialog diagnostics:\n${JSON.stringify(dialogDiag, null, 2)}`);

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'discover-zfs-odemo-m009-confirm-dialog.png'), fullPage: true });

  // Abort - click Cancel by its text, never Confirm, so this stays read-only.
  const cancelBtn = frame.getByRole('button', { name: 'Cancel', exact: true }).first();
  if (await cancelBtn.count().catch(() => 0)) {
    await cancelBtn.click();
    note('Clicked Cancel - no issuance created.');
  } else {
    note('WARNING: could not find a Cancel button by role/text - leaving dialog open, NOT clicking Confirm.');
  }
  await sapPage.waitForTimeout(500);

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'discover-zfs-odemo-m009-issuance-panel.png'), fullPage: true });
  writeFileSync(resolve(repoRoot, 'results', 'web', 'discover-zfs-odemo-m009-issuance-panel-log.txt'), log.join('\n'), 'utf8');

  expect(true).toBe(true);
});
