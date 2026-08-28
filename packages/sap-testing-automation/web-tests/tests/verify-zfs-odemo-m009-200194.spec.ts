import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY: checks the current state of Bond Class 200194 after the TC-010
 * write attempt, whose own post-write verification failed on a detached
 * frame handle (the ITS round trip invalidated it, same trap as TC-001).
 * This does not touch the write path at all - it only searches and reads.
 */

const log: string[] = [];
function note(line: string) {
  log.push(line);
  console.log(line);
}

test('VERIFY: current state of Bond Class 200194', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(6000);

  const frame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) throw new Error('Bond Workbench app frame not found');

  await frame.locator('#bc-search').fill('200194');
  await frame.getByRole('button', { name: 'Search', exact: true }).click();
  await sapPage.waitForTimeout(2000);

  const row = frame.locator('tr', { hasText: '200194' }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  const detail = await row.evaluate((r) => {
    const cb = r.querySelector('input.bc-issuance-select') as HTMLInputElement | null;
    return {
      rowText: (r.textContent ?? '').replace(/\s+/g, ' ').trim(),
      transNo: cb?.getAttribute('data-trans-no') ?? null,
      units: cb?.getAttribute('data-no-of-units') ?? null,
      price: cb?.getAttribute('data-issuance-price') ?? null,
      issuanceDate: cb?.getAttribute('data-issuance-date') ?? null,
    };
  });
  note(`Class 200194 current state: ${JSON.stringify(detail, null, 2)}`);

  const totals = await frame.evaluate(() => {
    const t = document.body.innerText;
    return {
      totalBonds: t.match(/Total Bonds\s*\n\s*(\d+)/)?.[1] ?? '?',
      records: t.match(/(\d+)\s+record/)?.[1] ?? '?',
    };
  });
  note(`Totals: ${JSON.stringify(totals)}`);

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'verify-zfs-odemo-m009-200194.png'), fullPage: true });
  writeFileSync(resolve(repoRoot, 'results', 'web', 'verify-zfs-odemo-m009-200194-log.txt'), log.join('\n'), 'utf8');

  expect(true).toBe(true);
});
