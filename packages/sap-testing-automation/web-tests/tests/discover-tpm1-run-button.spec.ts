import { test, expect } from '../fixtures';
import { dumpScreen } from '../webgui';
import { runValuation } from '../modules/treasury';
import { makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: TPM1's F8 only *selects* positions - it lands on
 * "Display Selected Treasury Positions for Valuation" with the deal listed as
 * "Valuation Allowed" and a "Run Valuation" button still unpressed. So the
 * valuation is a two-step flow and TC-009's WRITE 5 had not actually
 * happened. Find that button's id. Test Run stays ON, so nothing commits.
 *
 *   npx playwright test --project=exploratory tests/discover-tpm1-run-button.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-tpm1-run-button-log.txt');
});

test('DISCOVERY: TPM1 Run Valuation button on the positions screen', async ({ sapPage }) => {
  test.setTimeout(120_000);

  const res = await runValuation(
    sapPage,
    {
      companyCode: '1000',
      dealNo: '160247',
      keyDate: '31.01.2026',
      valuationArea: '001',
      valuationClass: '0005',
      valuationCategory: 'Mid-Year Valuation with Reset',
    },
    true, // test run - nothing commits
    { note: log.note, tag: 'discover-tpm1-runbtn' },
  );
  log.note(`refusedToRun=${res.refusedToRun} blocked=${res.blocked}`);

  const dump = await dumpScreen(sapPage, 'discover-tpm1-positions', { full: true });
  const buttons = (dump.controls as Array<{ id: string; title: string; text: string; isInput: boolean }>)
    .filter((c) => !c.isInput)
    .map((c) => ({ id: c.id, title: c.title, text: c.text }));
  log.note(`buttons on the positions screen: ${JSON.stringify(buttons, null, 2)}`);

  const runBtn = buttons.find((b) => /run valuation/i.test(`${b.text} ${b.title}`));
  log.note(`Run Valuation button: ${JSON.stringify(runBtn)}`);

  expect(runBtn, 'a Run Valuation button must exist on the positions screen').toBeTruthy();
});
