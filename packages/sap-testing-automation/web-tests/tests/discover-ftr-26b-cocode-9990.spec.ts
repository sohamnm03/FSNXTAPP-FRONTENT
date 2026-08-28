import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, pressKey, screenInfo,
  writeArtifact, dismissLiveSearch, statusMessage, captureEvidence,
} from '../webgui';

/**
 * READ-ONLY discovery: does company code 9990 accept product type 26B in
 * FTR_CREATE? Requested specifically, alongside 0001 which discover-ftr-26b-
 * cocode.spec.ts already found accepts it.
 *
 * WRITES NOTHING.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

test('DISCOVER: does company code 9990 accept product type 26B', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await openTransaction(sapPage, 'FTR_CREATE');
  const session = await screenInfo(sapPage);
  expect(session.system).toContain('DS4');
  expect(session.client).toContain('100');

  await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });
  await setFieldVerified(sapPage, 'Company Code', '9990');
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Product Type', '26B');
  await dismissLiveSearch(sapPage);
  await pressKey(sapPage, 'Enter');

  const msg = await statusMessage(sapPage).catch(() => '?');
  const ok = !/not available/i.test(msg);
  note(`9990: "${msg}" ${ok ? '<-- ACCEPTED' : '<-- REFUSED'}`);
  await captureEvidence(sapPage, 'ftr-26b-cocode-9990', `26B under company code 9990: ${msg}`);

  writeArtifact('discover-ftr-26b-cocode-9990.txt', out.join('\n'));
});
