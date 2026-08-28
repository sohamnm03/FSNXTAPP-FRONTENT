import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY probe of the ZFS_ODEMO_M006 form markup.
 *
 * The company code / partner / product type / currency inputs render with a
 * dropdown arrow. Whether they are plain text inputs, <datalist> combos, or
 * custom widgets that only accept a picked option decides how the create spec
 * has to fill them - and getting it wrong writes a half-populated record.
 */
test('probe facility form markup', async ({ sapPage }) => {
  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M006`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await sapPage.waitForTimeout(5000);

  const frame = sapPage
    .frames()
    .find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) throw new Error('app frame not found');

  const out: string[] = [];

  // Markup around each combo-style input.
  for (const id of ['i-cocode', 'i-partner', 'i-prdtype', 'i-currency', 'i-startdate', 'i-limitamt']) {
    const html = await frame
      .evaluate((elId) => {
        const el = document.getElementById(elId);
        if (!el) return `${elId}: NOT FOUND`;
        const wrap = el.closest('div') ?? el.parentElement;
        return `${elId} outerHTML:\n${el.outerHTML}\n--- wrapper ---\n${(wrap?.outerHTML ?? '').slice(0, 1500)}`;
      }, id)
      .catch((e) => `${id}: ${e}`);
    out.push(`\n===== ${id} =====\n${html}`);
  }

  // Any datalists on the page, and what they offer.
  const lists = await frame.evaluate(() => {
    const res: Record<string, string[]> = {};
    document.querySelectorAll('datalist').forEach((dl) => {
      res[dl.id || '(no id)'] = Array.from(dl.querySelectorAll('option'))
        .slice(0, 12)
        .map((o) => `${(o as HTMLOptionElement).value} | ${o.textContent?.trim() ?? ''}`);
    });
    return res;
  });
  out.push(`\n===== datalists =====\n${JSON.stringify(lists, null, 2)}`);

  // Click the arrow next to company code and see what appears.
  await frame.locator('#i-cocode').click().catch(() => {});
  await sapPage.waitForTimeout(800);
  const afterClick = await frame.evaluate(() => {
    const vis: string[] = [];
    document.querySelectorAll('ul, .dropdown, [role="listbox"], .suggestions, .autocomplete').forEach((el) => {
      const s = window.getComputedStyle(el);
      if (s.display !== 'none' && s.visibility !== 'hidden' && (el as HTMLElement).offsetHeight > 0) {
        vis.push(`${el.tagName}.${el.className} #${el.id} -> ${(el.textContent ?? '').trim().slice(0, 300)}`);
      }
    });
    return vis;
  });
  out.push(`\n===== visible list containers after clicking i-cocode =====\n${afterClick.join('\n')}`);

  writeFileSync(resolve(repoRoot, 'results', 'web', 'facility-form-markup.txt'), out.join('\n'), 'utf8');
  console.log(out.join('\n'));
});
