import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, readField, screenInfo, clickButton,
  writeArtifact, bodyText, captureEvidence, handleKnownPopups, settle,
} from '../webgui';

/**
 * READ-ONLY verification of a saved deal's interest schedule.
 *
 * FTR_CREATE showing "On Last Day of Month" proves the dropdown was set; it
 * does not prove SAP generated month-end interest flows from it. The cash flow
 * is where that becomes observable, and it is only visible once the deal is
 * saved - so it cannot be asserted inside the create flow.
 *
 * Opens the deal via FTR_EDIT -> **Display** (M0:46:::4:8), never Change, so
 * there is no edit lock and nothing can be committed by accident.
 *
 *   $env:DEAL_NO="200109"; npx playwright test tests/verify-ftr-cashflow.spec.ts
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;
const DISPLAY_BTN = 'M0:46:::4:8';
const CASHFLOW_TAB = 'M0:46:2::0:6-title';

const DEAL_NO = (process.env.DEAL_NO ?? '').trim();

// Needs a deal to look at, so it cannot be part of a plain `npm test` sweep -
// without this the whole suite fails on a missing env var rather than on
// anything about SAP.
test.skip(!DEAL_NO, 'set DEAL_NO=<deal> to run this verification');

test('VERIFY (read-only): cash flow of a saved term loan', async ({ sapPage }) => {
  test.setTimeout(600_000);

  const dealNo = DEAL_NO;
  expect(dealNo, 'DEAL_NO must be a transaction number').toMatch(/^\d{5,12}$/);

  await openTransaction(sapPage, 'FTR_EDIT');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await setFieldVerified(sapPage, 'Company Code', '9800');
  await setFieldVerified(sapPage, 'Financial Transaction', dealNo);

  // Display, not Change. This transaction can settle, reverse and terminate -
  // clicking the wrong neighbour here would be a write.
  await clickButton(sapPage, DISPLAY_BTN);
  await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));

  const onDeal = await screenInfo(sapPage);
  console.log(`display screen: ${JSON.stringify(onDeal)}`);

  // The schedule as stored, read off the Structure tab of the saved deal.
  const stored = {
    'Frequency Indicator': await readField(sapPage, 'Frequency Indicator').catch(() => 'NOT READABLE'),
    'Defined Frequency': await readField(sapPage, 'Defined Frequency in Days or Months').catch(() => 'NOT PRESENT'),
    'Unit': await readField(sapPage, 'Treasury: Unit of Frequency').catch(() => 'NOT PRESENT'),
    'Nominal Interest Rate': await readField(sapPage, 'Nominal Interest Rate').catch(() => 'NOT READABLE'),
    'Term Start': await readField(sapPage, 'Term Start').catch(() => 'NOT READABLE'),
    'End of Term': await readField(sapPage, 'End of Term').catch(() => 'NOT READABLE'),
  };
  console.log(`STORED SCHEDULE: ${JSON.stringify(stored, null, 2)}`);

  await clickButton(sapPage, CASHFLOW_TAB);
  await settle(sapPage);

  const flows = await bodyText(sapPage);
  await captureEvidence(sapPage, `tc-002-${dealNo}-4-cashflow`);
  writeArtifact(
    `tc-002-${dealNo}-cashflow.txt`,
    `${JSON.stringify(stored, null, 2)}\n\n--- cash flow ---\n${flows}`,
  );

  // Every date the cash flow shows, so the rhythm can be read off the result
  // rather than inferred from the setting that produced it.
  const dates = Array.from(flows.matchAll(/\b(\d{2}\.\d{2}\.\d{4})\b/g)).map((m) => m[1]);
  const unique = [...new Set(dates)].sort(
    (a, b) =>
      new Date(a.split('.').reverse().join('-')).getTime() -
      new Date(b.split('.').reverse().join('-')).getTime(),
  );
  console.log(`CASH FLOW DATES (${unique.length}): ${unique.join(', ')}`);

  // Month-end interest means dates landing on the last day of a month.
  const lastDay = (d: string) => {
    const [dd, mm, yyyy] = d.split('.').map(Number);
    return dd === new Date(yyyy, mm, 0).getDate();
  };
  const monthEnds = unique.filter(lastDay);
  console.log(`MONTH-END DATES (${monthEnds.length}): ${monthEnds.join(', ')}`);

  expect(stored['Frequency Indicator'], 'stored schedule must be month-end').toMatch(
    /last day of month/i,
  );
  expect(monthEnds.length, 'a monthly month-end schedule must produce month-end flow dates')
    .toBeGreaterThan(1);
});
