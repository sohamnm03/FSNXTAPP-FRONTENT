import { test, expect } from '../fixtures';
import { dumpScreen, clickButton } from '../webgui';
import { openDealEntry, fillTermLoan } from '../modules/treasury';
import { makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: "Additional Tab" does not carry "General Valuation
 * Class" (checked, see discover-ftr-tab-click.spec.ts's dump). Try
 * "Administr." next - the classic home for classification/valuation
 * attributes on a treasury deal. Nothing is saved.
 *
 *   npx playwright test --project=exploratory tests/discover-ftr-administr-tab.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-ftr-administr-tab-log.txt');
});

test('DISCOVERY: Administr. tab on the FTR_CREATE deal screen', async ({ sapPage }) => {
  test.setTimeout(120_000);

  const spec = {
    companyCode: '1000', productType: '22A', transactionType: '100', partner: '700000453',
    amount: '100000', currency: 'INR', interestRate: '10',
    startDate: '01.01.2026', endDate: '31.12.2026', contractDate: '01.01.2026',
  };
  const ctx = { note: log.note, tag: 'discover-admtab' };
  await openDealEntry(sapPage, spec, ctx);
  await fillTermLoan(sapPage, spec, ctx);

  await clickButton(sapPage, 'M0:46:2::0:3-title');
  const dump = await dumpScreen(sapPage, 'discover-admtab-administr', { full: true });
  const hit = dump.text.match(/gen(?:eral)?\.?\s*valuation\s*clas/i);
  log.note(`Administr. tab: ${dump.controls.length} controls, valuation-class text match: ${hit ? hit[0] : 'none'}`);

  if (hit) {
    const fieldHit = (dump.controls as Array<{ title: string; id: string; value: string }>).find((c) =>
      /valuation\s*clas/i.test(c.title),
    );
    log.note(`  matching field control: ${JSON.stringify(fieldHit)}`);
  } else {
    // Not here either - log every input title on this tab so the next tab to
    // try can be picked deliberately instead of clicking through all of them.
    const titles = (dump.controls as Array<{ title: string; isInput: boolean }>)
      .filter((c) => c.isInput && c.title)
      .map((c) => c.title);
    log.note(`Administr. tab input titles: ${JSON.stringify(titles)}`);
  }

  expect(hit, 'General Valuation Class must be found on the Administr. tab').toBeTruthy();
});
