import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, readField, screenInfo, clickButton,
  writeArtifact, bodyText, captureEvidence, handleKnownPopups, settle,
} from '../webgui';

/**
 * READ-ONLY: record the stored settings and cash flow of saved deals.
 *
 * Opens each through FTR_EDIT -> **Display** (never Change), so no edit lock is
 * taken and nothing can commit. This is the authoritative evidence for a
 * variant: what the deal screen showed before saving is an intention, what the
 * saved deal holds is the result.
 *
 *   $env:DEAL_NOS="200110,200111"; npx playwright test tests/verify-ftr-deals.spec.ts
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;
const DISPLAY_BTN = 'M0:46:::4:8';
const CASHFLOW_TAB = 'M0:46:2::0:6-title';

const DEALS = (process.env.DEAL_NOS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

test.skip(DEALS.length === 0, 'set DEAL_NOS="200110,200111,..." to run');

test('VERIFY (read-only): stored settings + cash flow for a list of deals', async ({ sapPage }) => {
  test.setTimeout(900_000);
  const out: string[] = ['# Saved deals - stored settings and cash flow', ''];

  const lastDay = (d: string) => {
    const [dd, mm, yyyy] = d.split('.').map(Number);
    return dd === new Date(yyyy, mm, 0).getDate();
  };

  for (const deal of DEALS) {
    expect(deal, 'deal must be a transaction number').toMatch(/^\d{5,12}$/);

    await openTransaction(sapPage, 'FTR_EDIT');
    const info = await screenInfo(sapPage);
    expect(info.system, 'must be DS4').toContain('DS4');
    expect(info.client, 'must be client 100').toContain('100');

    await setFieldVerified(sapPage, 'Company Code', '9800');
    await setFieldVerified(sapPage, 'Financial Transaction', deal);
    await clickButton(sapPage, DISPLAY_BTN);
    await handleKnownPopups(sapPage, SAFE_POPUP, () => {});

    const stored: Record<string, string> = {};
    for (const [label, title] of [
      ['Interest Category', 'Interest Category'],
      ['Nominal Interest Rate', 'Nominal Interest Rate'],
      ['Interest Calc Method', 'Interest Calculation Method'],
      ['Frequency Indicator', 'Frequency Indicator'],
      ['Defined Frequency', 'Defined Frequency in Days or Months'],
      ['Unit of Frequency', 'Treasury: Unit of Frequency'],
      ['Repayment Method', 'Repayment Method'],
      ['Rounding Category', 'Rounding Category'],
      ['Calculation Period', 'Calculation Period: Start Included vs. End Included'],
      ['Term Category', 'Term Category'],
      ['Term Start', 'Term Start'],
      ['End of Term', 'End of Term'],
    ] as const) {
      stored[label] = await readField(sapPage, title).catch(() => 'n/a');
    }

    await clickButton(sapPage, CASHFLOW_TAB).catch(() => {});
    await settle(sapPage);
    const text = await bodyText(sapPage);
    await captureEvidence(sapPage, `tc-003-deal-${deal}-cashflow`);

    const dates = [
      ...new Set(Array.from(text.matchAll(/\b(\d{2}\.\d{2}\.\d{4})\b/g)).map((m) => m[1])),
    ].sort(
      (a, b) =>
        new Date(a.split('.').reverse().join('-')).getTime() -
        new Date(b.split('.').reverse().join('-')).getTime(),
    );
    const monthEnds = dates.filter(lastDay);

    out.push(`## Deal ${deal}`);
    out.push('');
    for (const [k, val] of Object.entries(stored)) {
      if (val !== 'n/a' && val !== '') out.push(`- ${k}: \`${val}\``);
    }
    out.push(`- cash flow dates (${dates.length}): ${dates.join(', ') || '(none read)'}`);
    out.push(`- of which month-end: ${monthEnds.length}`);
    out.push('');

    console.log(
      `${deal}: freq="${stored['Frequency Indicator']}" calc="${stored['Interest Calc Method']}" ` +
        `dates=${dates.length} monthEnd=${monthEnds.length}`,
    );
  }

  writeArtifact('tc-003-saved-deals.md', out.join('\n'));
  console.log('written: results/web/tc-003-saved-deals.md');
});
