import { test, expect } from '../fixtures';
import { dumpScreen, clickButton } from '../webgui';
import { openDealEntry } from '../modules/treasury';
import { makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: the FTR_CREATE deal screen's Structure tab has no field
 * titled "General Valuation Class", but TC-009's first live attempt was
 * refused at the check-run with "Fill the following required field: General
 * Valuation Class" - so it lives on one of the deal screen's other tabs
 * (Additional Tab, Administr., ...). This clicks through them and dumps each,
 * to find which tab and field title/id actually carries it. Nothing is saved.
 *
 *   npx playwright test --project=exploratory tests/discover-ftr-gen-valuation-class.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-ftr-gen-valuation-class-log.txt');
});

test('DISCOVERY: locate General Valuation Class on the FTR_CREATE deal screen', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await openDealEntry(
    sapPage,
    {
      companyCode: '1000', productType: '22A', transactionType: '100', partner: '700000453',
      amount: '', currency: '', interestRate: '', startDate: '', endDate: '', contractDate: '',
    },
    { note: log.note, tag: 'discover-gvc' },
  );

  const tabs = [
    { id: 'M0:46:2::0:1-title', name: 'Additional Tab' },
    { id: 'M0:46:2::0:3-title', name: 'Administr.' },
    { id: 'M0:46:2::0:4-title', name: 'Other Flows' },
  ];

  let found = false;
  for (const tab of tabs) {
    await clickButton(sapPage, tab.id);
    const dump = await dumpScreen(sapPage, `discover-gvc-${tab.name.replace(/\W+/g, '-').toLowerCase()}`, { full: true });
    const hit = dump.text.match(/gen(?:eral)?\.?\s*valuation\s*clas/i);
    log.note(`tab "${tab.name}": ${dump.controls.length} controls, valuation-class text match: ${hit ? hit[0] : 'none'}`);
    if (hit) {
      found = true;
      const fieldHit = (dump.controls as Array<{ title: string; id: string }>).find((c) =>
        /valuation\s*clas/i.test(c.title),
      );
      log.note(`  matching field control: ${JSON.stringify(fieldHit)}`);
    }
  }

  expect(found, 'General Valuation Class must be found on one of the deal screen tabs').toBe(true);
});
