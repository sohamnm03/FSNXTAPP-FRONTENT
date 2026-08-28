import { test, expect } from '../fixtures';
import { dumpScreen } from '../webgui';
import { openDealEntry } from '../modules/treasury';
import { makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: TC-009 asks for company code 1000 / product type 22A /
 * transaction type 100, none of which this workspace has driven before - every
 * prior case (TC-002, TC-003, TC-008) used 10B/200, which lands on the
 * term-loan Structure tab (SAPLFTR_IRATE/1100). This finds out what screen 22A
 * actually opens, before ftr-deal-irate's field titles get assumed to apply to
 * a different product.
 *
 * Uses openDealEntry() from treasury.ts (fills the FTR_CREATE entry screen and
 * presses Enter) rather than duplicating that navigation - it is read-only,
 * nothing here saves.
 *
 *   npx playwright test --project=exploratory tests/discover-ftr-1000-22a.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-ftr-1000-22a-log.txt');
});

test('DISCOVERY: FTR_CREATE with company code 1000 / product 22A / txn type 100', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await openDealEntry(
    sapPage,
    {
      companyCode: '1000',
      productType: '22A',
      transactionType: '100',
      partner: '700000453',
      // Not read by openDealEntry() - placeholders only.
      amount: '', currency: '', interestRate: '', startDate: '', endDate: '', contractDate: '',
    },
    { note: log.note, tag: 'discover-ftr-1000-22a' },
  );

  const dump = await dumpScreen(sapPage, 'discover-ftr-1000-22a-deal', { full: true });
  log.note(`landed on screen title: "${dump.title}"`);
  log.note(`${dump.controls.length} controls captured`);

  expect(dump.controls.length, 'the deal screen must expose at least one control').toBeGreaterThan(0);
});
