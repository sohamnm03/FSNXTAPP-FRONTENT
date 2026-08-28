import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Resolve from this file, not the cwd - the cwd depends on how the runner was
// invoked and silently writes the dump outside the workspace.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY exploration of ZFS_ODEMO_M006 (Facility Creation) in the ITS WebGUI.
 *
 * The SAP GUI lane renders this transaction as an empty HTML container, so the
 * form only exists in the browser. This spec opens the transaction, proves the
 * screen rendered, and dumps every input control it can see so a real test case
 * can name field ids instead of guessing them.
 *
 * It fills nothing and saves nothing. Delete once the real case exists.
 */
test('explore ZFS_ODEMO_M006 facility creation form', async ({ sapPage }) => {
  const url = `${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M006`;
  await sapPage.goto(url, { waitUntil: 'domcontentloaded' });

  // Presence before absence: prove the WebGUI shell actually rendered.
  await expect(
    sapPage.locator('#shell, .sapUiBody, #canvas, body').first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);

  // ITS renders into frames often enough that guessing the wrong one looks like
  // an empty screen. Walk every frame and report what each one holds.
  await sapPage.waitForTimeout(5000);

  const report: string[] = [];
  report.push(`URL: ${url}`);
  report.push(`title: ${await sapPage.title()}`);

  for (const frame of sapPage.frames()) {
    const controls = await frame
      .evaluate(() => {
        const out: Record<string, unknown>[] = [];
        const nodes = document.querySelectorAll(
          'input, select, textarea, button, a[role="button"], [role="textbox"]',
        );
        nodes.forEach((el) => {
          const e = el as HTMLInputElement;
          const style = window.getComputedStyle(e);
          if (style.display === 'none' || style.visibility === 'hidden') return;
          out.push({
            tag: e.tagName,
            type: e.type ?? '',
            id: e.id ?? '',
            name: e.name ?? '',
            title: e.title ?? '',
            value: e.type === 'password' ? '<redacted>' : (e.value ?? '').slice(0, 60),
            label: (e.getAttribute('aria-label') ?? '').slice(0, 60),
            text: (e.textContent ?? '').trim().slice(0, 40),
          });
        });
        return out;
      })
      .catch(() => []);

    const text = await frame
      .evaluate(() => document.body?.innerText?.slice(0, 3000) ?? '')
      .catch(() => '');

    if (controls.length === 0 && text.trim() === '') continue;

    report.push(`\n===== FRAME: ${frame.url()} =====`);
    report.push(`--- visible text ---\n${text}`);
    report.push(`--- controls (${controls.length}) ---`);
    controls.forEach((c) => report.push(JSON.stringify(c)));
  }

  mkdirSync(resolve(repoRoot, 'results', 'web'), { recursive: true });
  mkdirSync(resolve(repoRoot, 'evidence'), { recursive: true });
  writeFileSync(
    resolve(repoRoot, 'results', 'web', 'facility-form-dump.txt'),
    report.join('\n'),
    'utf8',
  );
  await sapPage.screenshot({
    path: resolve(repoRoot, 'evidence', 'zfs-odemo-m006-webgui.png'),
    fullPage: true,
  });

  console.log(report.join('\n'));
});
