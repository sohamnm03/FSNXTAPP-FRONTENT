import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY discovery: the "Create Bond" panel (bc-* fields) in the
 * ZFS_ODEMO_M009 Bond Workbench - creates a brand-new Bond Class, distinct
 * from Create Issuance (TC-010, which issues against an existing class).
 *
 * Finds out what values the Company Code autocomplete actually offers, and
 * the default/select options for Product Type, Int Cal Method, Currency and
 * Coupon Frequency, before any create-bond spec assumes values that don't
 * exist. Nothing here clicks bc-submit-btn.
 */

const log: string[] = [];
function note(line: string) {
  log.push(line);
  console.log(line);
}

test('DISCOVERY: ZFS_ODEMO_M009 Create Bond panel fields', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(5000);

  const frame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) throw new Error('Bond Workbench app frame not found');

  // Company Code autocomplete - same pattern as ZFS_ODEMO_M006's bc-cocode
  // sibling. Click it and see what renders without typing anything first.
  await frame.locator('#bc-cocode').click();
  await sapPage.waitForTimeout(1000);

  const dropdownAfterClick = await frame.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll('[id*="cocode"], [class*="dropdown"], [class*="autocomplete"], [class*="suggest"]'),
    );
    return candidates
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => ({
        id: el.id,
        className: (el as HTMLElement).className,
        text: (el.textContent ?? '').trim().slice(0, 500),
      }));
  });
  note(`visible cocode-related elements after click (no typing): ${JSON.stringify(dropdownAfterClick, null, 2)}`);

  // Try typing a couple of different probes to see what the autocomplete
  // actually searches on (code vs name) and what it returns.
  for (const probe of ['9', '98', 'a']) {
    await frame.locator('#bc-cocode').fill('');
    await frame.locator('#bc-cocode').type(probe, { delay: 60 });
    await sapPage.waitForTimeout(1000);
    const options = await frame.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('[id*="cocode"] [class*="option"], [id*="cocode"] li, [id*="cocode"] div, [class*="dropdown"] > *, [class*="autocomplete"] > *, [class*="suggest"] > *'),
      );
      return candidates
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((el) => (el.textContent ?? '').trim())
        .filter(Boolean);
    });
    note(`bc-cocode typed "${probe}" -> options: ${JSON.stringify(options)}`);
  }

  const cocodeHtml = await frame.locator('#bc-cocode').evaluate((el) => el.outerHTML);
  note(`bc-cocode outerHTML: ${cocodeHtml}`);

  // The select dropdowns (Product Type, Int Cal Method, Currency, Coupon
  // Frequency) already declare their own options in markup - read them
  // directly rather than opening each one.
  const selects = await frame.evaluate(() => {
    const ids = ['bc-prodtype', 'bc-intcalmethod', 'bc-currency', 'bc-couponfreq'];
    return ids.map((id) => {
      const el = document.getElementById(id) as HTMLSelectElement | HTMLInputElement | null;
      if (!el) return { id, found: false };
      if (el.tagName === 'SELECT') {
        return {
          id,
          found: true,
          tag: 'SELECT',
          options: Array.from((el as HTMLSelectElement).options).map((o) => ({ value: o.value, text: o.text })),
          currentValue: (el as HTMLSelectElement).value,
        };
      }
      return { id, found: true, tag: el.tagName, currentValue: (el as HTMLInputElement).value };
    });
  });
  note(`select field options:\n${JSON.stringify(selects, null, 2)}`);

  // Prodtype hidden default (observed pre-filled to 22B in the earlier full
  // screen dump) - confirm it's still the case.
  const prodtypeHidden = await frame.locator('#bc-prodtype-hidden').inputValue().catch(() => '(not found)');
  note(`bc-prodtype-hidden default: "${prodtypeHidden}"`);

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'discover-zfs-odemo-m009-create-bond-panel.png'), fullPage: true });
  writeFileSync(resolve(repoRoot, 'results', 'web', 'discover-zfs-odemo-m009-create-bond-panel-log.txt'), log.join('\n'), 'utf8');

  expect(true).toBe(true);
});
