import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY explorer for a classic Dynpro transaction rendered in the ITS
 * WebGUI. Dumps every control with the ABAP field name ITS puts in `name`/`ct`
 * attributes, so a test can address fields by their real names instead of
 * guessing generated ids.
 *
 *   $env:TCODE="FTR_CREATE"; npx playwright test dynpro-explore
 */
const TCODE = process.env.TCODE ?? 'FTR_CREATE';

test(`explore Dynpro screen: ${TCODE}`, async ({ sapPage }) => {
  test.setTimeout(180_000);

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=${TCODE}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(6000);

  const dump = await sapPage.evaluate(() => {
    const controls: Record<string, unknown>[] = [];
    document
      .querySelectorAll('input, select, textarea, button, a[role="button"], [role="combobox"]')
      .forEach((el) => {
        const e = el as HTMLInputElement;
        const box = e.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) return;
        controls.push({
          tag: e.tagName,
          type: e.getAttribute('type') ?? '',
          id: e.id || '',
          name: e.getAttribute('name') || '',
          ct: e.getAttribute('ct') || '',            // ITS control type
          lsdata: (e.getAttribute('lsdata') || '').slice(0, 120),
          title: e.title || '',
          aria: e.getAttribute('aria-label') || '',
          value: e.type === 'password' ? '<redacted>' : (e.value ?? '').slice(0, 40),
          text: (e.textContent ?? '').trim().slice(0, 40),
        });
      });
    return {
      title: document.title,
      text: (document.body.innerText ?? '').slice(0, 6000),
      controls,
    };
  });

  const out = [
    `TCODE: ${TCODE}`,
    `title: ${dump.title}`,
    `\n--- visible text ---\n${dump.text}`,
    `\n--- controls (${dump.controls.length}) ---`,
    ...dump.controls.map((c) => JSON.stringify(c)),
  ].join('\n');

  mkdirSync(resolve(repoRoot, 'results', 'web'), { recursive: true });
  mkdirSync(resolve(repoRoot, 'evidence'), { recursive: true });
  writeFileSync(resolve(repoRoot, 'results', 'web', `dynpro-${TCODE}.txt`), out, 'utf8');
  await sapPage.screenshot({
    path: resolve(repoRoot, 'evidence', `dynpro-${TCODE}.png`),
    fullPage: true,
  });
  console.log(`wrote dynpro-${TCODE}.txt (${dump.controls.length} controls)`);
});
