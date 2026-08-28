import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY discovery: opens the Class ID hotspot popup for Bond Class 200216
 * (openClassIdHotspot) to read its full Bond Class Details - company code,
 * product type, coupon rate/frequency, int cal method - none of which are
 * exposed on the register row's data-* attributes. The user wants to model a
 * new Bond Class on 200216, so its full detail set is needed before drafting
 * that case. Nothing here writes.
 */

const log: string[] = [];
function note(line: string) {
  log.push(line);
  console.log(line);
}

test('DISCOVERY: ZFS_ODEMO_M009 Class ID hotspot for 200216', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(5000);

  const frame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) throw new Error('Bond Workbench app frame not found');

  await frame.locator('#bc-search').fill('200216');
  await frame.getByRole('button', { name: 'Search', exact: true }).click();
  await sapPage.waitForTimeout(1500);

  const hotspot = frame.locator('button.hotspot', { hasText: '200216' }).first();
  await expect(hotspot).toBeVisible({ timeout: 15_000 });
  await hotspot.click();
  await sapPage.waitForTimeout(2500);

  const liveFrame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm')) ?? frame;

  const dialogText = await liveFrame.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.modal-card')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return cards.map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim());
  });
  note(`Class ID hotspot dialog(s) for 200216:\n${JSON.stringify(dialogText, null, 2)}`);

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'discover-zfs-odemo-m009-hotspot-200216.png'), fullPage: true });
  writeFileSync(resolve(repoRoot, 'results', 'web', 'discover-zfs-odemo-m009-classid-hotspot-log.txt'), log.join('\n'), 'utf8');

  expect(true).toBe(true);
});
