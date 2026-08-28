import { test, expect } from '../fixtures';
import { sapSystem } from '../sap-system';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * READ-ONLY. The app's create POST is rejected with "Property 'Action' is
 * invalid", so the payload it builds does not match the service contract.
 * Fetch $metadata to see what ZAPI_FS_ODEMO_T006_O4 actually declares.
 */
test('probe OData service metadata', async ({ sapPage }) => {
  await sapPage.goto(`${sapSystem.webguiUrl}&~transaction=ZFS_ODEMO_M006`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(sapPage.locator('body').first()).toBeVisible({ timeout: 60_000 });
  await sapPage.waitForTimeout(4000);

  const base = '/sap/opu/odata4/sap/zapi_fs_odemo_t006_o4/srvd_a2x/sap/zapi_fs_odemo_t006_o4/0001';

  const result = await sapPage.evaluate(async (b) => {
    const get = async (path: string) => {
      const r = await fetch(path, { credentials: 'same-origin' });
      return { status: r.status, ct: r.headers.get('content-type'), body: (await r.text()).slice(0, 20000) };
    };
    return {
      metadata: await get(`${b}/$metadata`),
      root: await get(b),
      fac: await get(`${b}/FAC?$top=1`),
    };
  }, base);

  const out = [
    `=== $metadata (${result.metadata.status}, ${result.metadata.ct}) ===`,
    result.metadata.body,
    `\n=== service root (${result.root.status}) ===`,
    result.root.body.slice(0, 2000),
    `\n=== FAC?$top=1 (${result.fac.status}) ===`,
    result.fac.body.slice(0, 3000),
  ].join('\n');

  writeFileSync(resolve(repoRoot, 'results', 'web', 'odata-metadata.txt'), out, 'utf8');
  console.log(`metadata status ${result.metadata.status}, FAC status ${result.fac.status}`);
});
