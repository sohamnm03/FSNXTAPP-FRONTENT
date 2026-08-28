import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, pressKey, screenInfo,
  writeArtifact, captureEvidence, openValueHelp, readSearchHelp, closeValueHelp,
  dismissLiveSearch, readPopup, statusMessage, screenInfo as info2,
} from '../webgui';

/**
 * READ-ONLY discovery: which company code has product type 26B configured
 * for FTR_CREATE?
 *
 * 9800 and 1000 (the only company codes this workspace has used so far) both
 * refuse 26B with "Product type 26B not available in company code X".
 * Company codes are the field's own F4 list; trying each one against 26B
 * live is the only way to find one that works without guessing (CLAUDE.md
 * rule 4).
 *
 * WRITES NOTHING.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

test('DISCOVER: Company Code F4 list, then which one accepts 26B', async ({ sapPage }) => {
  test.setTimeout(600_000);

  await openTransaction(sapPage, 'FTR_CREATE');
  const session = await screenInfo(sapPage);
  expect(session.system).toContain('DS4');
  expect(session.client).toContain('100');

  await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });
  await openValueHelp(sapPage, 'Company Code');
  const help = await readSearchHelp(sapPage);
  await captureEvidence(sapPage, 'ftr-cocode-f4', 'Company Code F4 list');
  await closeValueHelp(sapPage);

  note(`Company Code F4: ${help.rows.length} rows (of ${help.total})`);
  for (const r of help.rows) note(`  ${r.join(' | ')}`);
  writeArtifact('ftr-cocode-f4.txt', out.join('\n'));

  const codes = help.rows.map((r) => r[0]).filter((c) => /^[0-9A-Z]{4}$/.test(c));
  const untried = codes.filter((c) => c !== '9800' && c !== '1000');
  note(`\ncandidates to try against 26B: ${untried.join(', ')}`);

  for (const cc of untried) {
    await openTransaction(sapPage, 'FTR_CREATE');
    await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });
    await setFieldVerified(sapPage, 'Company Code', cc);
    await dismissLiveSearch(sapPage);
    await setFieldVerified(sapPage, 'Product Type', '26B');
    await dismissLiveSearch(sapPage);
    await pressKey(sapPage, 'Enter');
    const msg = await statusMessage(sapPage).catch(() => '?');
    const ok = !/not available/i.test(msg);
    note(`  ${cc}: "${msg}" ${ok ? '<-- ACCEPTED' : ''}`);
    if (ok) {
      await captureEvidence(sapPage, `ftr-26b-cocode-${cc}-accepted`, `26B accepted under company code ${cc}`);
      break;
    }
  }

  writeArtifact('discover-ftr-26b-cocode.txt', out.join('\n'));
});
