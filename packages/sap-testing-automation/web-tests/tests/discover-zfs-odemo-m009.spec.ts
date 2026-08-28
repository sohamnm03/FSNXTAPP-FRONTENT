import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY discovery: ZFS_ODEMO_M009 has never been opened from this
 * workspace. Nothing is known about its screen, fields or app frame - this
 * finds out, the same way TC-001 (ZFS_ODEMO_M006) was first discovered,
 * before any bond-creation spec assumes a field layout that does not exist.
 *
 * Nothing here submits or clicks a create/save action.
 */

const log: string[] = [];
function note(line: string) {
  log.push(line);
  console.log(line);
}

test('DISCOVERY: ZFS_ODEMO_M009 screen and form fields', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M009`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await expect(sapPage.locator('input[type="password"]')).toHaveCount(0);
  await sapPage.waitForTimeout(5000);

  note(`top-level frames: ${sapPage.frames().map((f) => f.url()).join('\n  ')}`);

  // Prefer the same custom-app frame ZFS_ODEMO_M006 renders into; fall back to
  // whatever frame actually carries form controls if the id differs.
  let frame = sapPage.frames().find((f) => f.url().includes('HTML000001.htm'));
  if (!frame) {
    for (const f of sapPage.frames()) {
      const count = await f.locator('input, select, button, [role="button"]').count().catch(() => 0);
      if (count > 0) {
        frame = f;
        break;
      }
    }
  }

  if (!frame) {
    note('No frame with form controls found - screen may be plain Dynpro/ITS, not a custom HTML app.');
    await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'discover-zfs-odemo-m009.png'), fullPage: true });
    writeFileSync(resolve(repoRoot, 'results', 'web', 'discover-zfs-odemo-m009-log.txt'), log.join('\n'), 'utf8');
    throw new Error('ZFS_ODEMO_M009: no frame with form controls found - see evidence screenshot and log');
  }

  note(`app frame url: ${frame.url()}`);

  const dump = await frame.evaluate(() => {
    const controls: Record<string, unknown>[] = [];
    document
      .querySelectorAll('input, select, textarea, button, [role="button"], a[id]')
      .forEach((el) => {
        const e = el as HTMLInputElement;
        controls.push({
          tag: e.tagName,
          id: e.id || '',
          type: e.getAttribute('type') || '',
          name: (e as any).name || '',
          title: e.title || '',
          placeholder: (e as any).placeholder || '',
          value: e.getAttribute('type') === 'password' ? '<redacted>' : (e.value ?? '').slice(0, 40),
          text: (e.textContent ?? '').trim().slice(0, 60),
        });
      });

    // Labels often sit next to inputs in these hand-built apps - capture them
    // so a field id can be matched back to its on-screen caption.
    const labels = Array.from(document.querySelectorAll('label')).map((l) => ({
      for: l.getAttribute('for') || '',
      text: (l.textContent ?? '').trim(),
    }));

    return {
      title: document.title,
      bodyText: (document.body.innerText ?? '').slice(0, 4000),
      controls,
      labels,
    };
  });

  note(`page title: ${dump.title}`);
  note(`\n--- body text (first 4000 chars) ---\n${dump.bodyText}`);
  note(`\n--- labels (${dump.labels.length}) ---`);
  dump.labels.forEach((l) => note(`  for="${l.for}"  "${l.text}"`));
  note(`\n--- controls (${dump.controls.length}) ---`);
  dump.controls.forEach((c) => note(`  ${JSON.stringify(c)}`));

  await sapPage.screenshot({ path: resolve(repoRoot, 'evidence', 'discover-zfs-odemo-m009.png'), fullPage: true });
  writeFileSync(resolve(repoRoot, 'results', 'web', 'discover-zfs-odemo-m009-log.txt'), log.join('\n'), 'utf8');

  expect(dump.controls.length, 'ZFS_ODEMO_M009 must expose at least one control').toBeGreaterThan(0);
});
