import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY: checks the current state of Bond Class 200219, created by the
 * TC-011 write attempt whose own post-write verification failed to re-find
 * the app frame (the "Class ID Created Successfully" dialog was still open
 * at that point). This does not touch the write path - it only reads.
 */

const log: string[] = [];
function note(line: string) {
  log.push(line);
  console.log(line);
}

test('VERIFY: current state of Bond Class 200219', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(6000);

  note(`all frames: ${sapPage.frames().map((f) => f.url()).join('\n  ')}`);

  const frame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) throw new Error('Bond Workbench app frame not found');

  await frame.locator('#bc-search').fill('200219');
  await frame.getByRole('button', { name: 'Search', exact: true }).click();
  await sapPage.waitForTimeout(2000);

  const row = frame.locator('tr', { hasText: '200219' }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  const detail = await row.evaluate((r) => {
    const cb = r.querySelector('input.bc-issuance-select') as HTMLInputElement | null;
    return {
      rowText: (r.textContent ?? '').replace(/\s+/g, ' ').trim(),
      shortName: cb?.getAttribute('data-short-name') ?? null,
      longName: cb?.getAttribute('data-long-name') ?? null,
      isin: cb?.getAttribute('data-isin') ?? null,
      faceValue: cb?.getAttribute('data-face-value') ?? null,
      currency: cb?.getAttribute('data-currency') ?? null,
      startDate: cb?.getAttribute('data-start-date') ?? null,
      endDate: cb?.getAttribute('data-end-date') ?? null,
      transNo: cb?.getAttribute('data-trans-no') ?? null,
    };
  });
  note(`Class 200219 current state: ${JSON.stringify(detail, null, 2)}`);

  const totals = await frame.evaluate(() => {
    const t = document.body.innerText;
    return { totalBonds: t.match(/Total Bonds\s*\n\s*(\d+)/)?.[1] ?? '?' };
  });
  note(`Totals: ${JSON.stringify(totals)}`);

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'verify-zfs-odemo-m009-200219.png'), fullPage: true });
  writeFileSync(resolve(repoRoot, 'results', 'web', 'verify-zfs-odemo-m009-200219-log.txt'), log.join('\n'), 'utf8');

  expect(detail.shortName).toBe('SSN - Jul 29');
  expect(detail.isin).toBe('USN8106HAA16');
  expect(Number(detail.faceValue)).toBe(1000);
  expect(detail.currency).toBe('USD');
});
