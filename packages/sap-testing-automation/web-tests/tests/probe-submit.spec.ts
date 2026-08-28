import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY. Dumps the facility app's own markup and scripts so we can see what
 * "Create Facility" is wired to. Two submit attempts round-tripped the screen
 * without writing a record, so the question is what the button actually calls.
 */
test('probe what submit-btn does', async ({ sapPage }) => {
  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M006`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await sapPage.waitForTimeout(5000);

  const frame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) throw new Error('app frame not found');

  const html = await frame.content();
  writeFileSync(resolve(repoRoot, 'results', 'web', 'facility-app.html'), html, 'utf8');
  console.log(`app HTML written: ${html.length} bytes`);

  const info = await frame.evaluate(() => {
    const btn = document.getElementById('submit-btn') as HTMLButtonElement | null;
    return {
      outerHTML: btn?.outerHTML ?? 'NOT FOUND',
      type: btn?.type,
      disabled: btn?.disabled,
      form: btn?.form ? `FORM #${btn.form.id} action=${btn.form.action}` : 'no form ancestor',
      onclickAttr: btn?.getAttribute('onclick') ?? '(none)',
      // Names of global functions that look relevant.
      globals: Object.keys(window).filter((k) =>
        /creat|submit|facility|save|post|send|sapevent/i.test(k),
      ),
    };
  });
  console.log(JSON.stringify(info, null, 2));
});
