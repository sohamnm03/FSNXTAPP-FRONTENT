import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, pressKey, screenInfo,
  writeArtifact, captureEvidence, openValueHelp, readSearchHelp, closeValueHelp,
} from '../webgui';

/**
 * READ-ONLY: what product types and transaction types does FTR_CREATE offer on
 * DS4/100?
 *
 * Everything downstream - money market, securities, foreign exchange, trade
 * finance - depends on knowing which product types are configured for company
 * code 9800 and which transaction types each accepts. Guessing them from the
 * SAP standard list is the mistake CLAUDE.md rule 4 warns about: an
 * unconfigured product type fails as "entry does not exist", which reads like a
 * product bug and is not one.
 *
 * The F4 hit list is the system's own answer, so that is what is captured.
 *
 * Writes results/web/ftr-product-types.txt and, for each product type named in
 * PRODUCT_TYPES, results/web/ftr-txn-types-<pt>.txt. Nothing is saved to SAP.
 *
 *   $env:DISCOVER="1"; npx playwright test tests/discover-product-types.spec.ts
 *   $env:PRODUCT_TYPES="51A,60A"   # also read each one's transaction types
 */

test.skip(process.env.DISCOVER !== '1', 'discovery spec - run with DISCOVER=1');

const COMPANY_CODE = '9800';

test('DISCOVERY: FTR_CREATE product types', async ({ sapPage }) => {
  test.setTimeout(900_000);

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  expect(info.system, 'must be DS4').toContain('DS4');
  expect(info.client, 'must be client 100').toContain('100');

  await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });
  await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
  await pressKey(sapPage, 'Enter');

  await openValueHelp(sapPage, 'Product Type');
  const help = await readSearchHelp(sapPage);
  await captureEvidence(sapPage, 'f4-product-types');
  await closeValueHelp(sapPage);

  const out = [
    `FTR_CREATE - Product Type value help, company code ${COMPANY_CODE}`,
    `captured read-only ${new Date().toISOString().slice(0, 10)}`,
    `dialog reports ${help.total ?? '?'} items; ${help.rows.length} rows read`,
    '',
    ...help.rows.map((r) => r.join('  |  ')),
  ].join('\n');

  writeArtifact('ftr-product-types.txt', out);
  console.log(`product types: ${help.rows.length} rows (dialog says ${help.total})`);
  console.log(help.rows.map((r) => r.join(' | ')).join('\n'));

  expect(help.rows.length, 'the value help must return product types').toBeGreaterThan(0);
});

/**
 * Transaction types are per product type, so they can only be read one product
 * at a time. Which products to ask about comes from the run above - passed in
 * rather than hardcoded, so this never asserts a product type exists.
 */
const WANTED = (process.env.PRODUCT_TYPES ?? '').split(',').map((s) => s.trim()).filter(Boolean);

for (const pt of WANTED) {
  test(`DISCOVERY: transaction types for product type ${pt}`, async ({ sapPage }) => {
    test.setTimeout(600_000);

    await openTransaction(sapPage, 'FTR_CREATE');
    const info = await screenInfo(sapPage);
    expect(info.system).toContain('DS4');
    expect(info.client).toContain('100');

    await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
    await setFieldVerified(sapPage, 'Product Type', pt);

    await openValueHelp(sapPage, 'Financial Transaction Type');
    const help = await readSearchHelp(sapPage);
    await captureEvidence(sapPage, `f4-txn-types-${pt}`);
    await closeValueHelp(sapPage);

    const out = [
      `FTR_CREATE - Financial Transaction Type value help`,
      `company code ${COMPANY_CODE}, product type ${pt}`,
      `dialog reports ${help.total ?? '?'} items; ${help.rows.length} rows read`,
      '',
      ...help.rows.map((r) => r.join('  |  ')),
    ].join('\n');

    writeArtifact(`ftr-txn-types-${pt}.txt`, out);
    console.log(`\n=== ${pt}: ${help.rows.length} transaction types ===`);
    console.log(help.rows.map((r) => r.join(' | ')).join('\n'));
  });
}
