import { test, expect } from '../fixtures';
import {
  openTransaction, setField, setFieldVerified, pressKey, screenInfo,
  handleKnownPopups, selectDropdown, openValueHelp, readSearchHelp, closeValueHelp,
  writeArtifact, bodyText, dumpScreen, readField,
} from '../webgui';

/**
 * READ-ONLY discovery: which Reference Interest Rate values does DS4 accept
 * for company code 1000 / product 22A / txn type 100, once Interest Category
 * is switched to Variable?
 *
 * TC-003's variant matrix tried Variable interest for the 9800/10B profile
 * (V10) and SAP refused the save with "Enter a reference interest rate" -
 * no rate was picked then, because picking one is a data decision. This finds
 * out what the field's own F4 search help actually lists for the 1000/22A
 * profile, so a human can choose a real value instead of one being guessed.
 *
 * Nothing here saves. The session is abandoned on the deal screen.
 *
 *   DISCOVER=1 npx playwright test tests/discover-ftr-1000-22a-variable-rate.spec.ts
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;

const DEAL = {
  companyCode: '1000',
  productType: '22A',
  transactionType: '100',
  partner: '700000453',
  startDate: '01.01.2026',
  endDate: '31.12.2026',
  amount: '100000',
  contractDate: '01.01.2026',
};

test.skip(process.env.DISCOVER !== '1', 'discovery spec - run with DISCOVER=1');

test('DISCOVERY: Reference Interest Rate options for 1000/22A variable interest', async ({ sapPage }) => {
  test.setTimeout(300_000);
  const parts: string[] = [];

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  expect(info.system, 'must be DS4').toContain('DS4');
  expect(info.client, 'must be client 100').toContain('100');

  await setFieldVerified(sapPage, 'Company Code', DEAL.companyCode);
  await setFieldVerified(sapPage, 'Product Type', DEAL.productType);
  await setFieldVerified(sapPage, 'Financial Transaction Type', DEAL.transactionType);
  await setFieldVerified(sapPage, 'Business Partner Number', DEAL.partner);
  await pressKey(sapPage, 'Enter');

  await expect(sapPage.locator('input[title="Term Start"]')).toBeVisible({ timeout: 30_000 });

  await setField(sapPage, 'Amount as Text Field', DEAL.amount);
  await setFieldVerified(sapPage, 'Term Start', DEAL.startDate);
  await setFieldVerified(sapPage, 'End of Term', DEAL.endDate);
  await setFieldVerified(sapPage, 'Contract Date', DEAL.contractDate);

  // Interest Category first - it rebuilds the whole interest block, same
  // ordering rule TC-003's variant matrix uses.
  const gotCategory = await selectDropdown(sapPage, 'Interest Category', 'Variable');
  parts.push(`Interest Category set to: ${gotCategory}`);
  await handleKnownPopups(sapPage, SAFE_POPUP, () => {});

  // Also apply Monthly frequency, since that is part of the target
  // configuration and may change what the interest block looks like.
  const freqTitleCandidates = ['Frequency Indicator'];
  let gotFreq = '';
  for (const t of freqTitleCandidates) {
    try {
      gotFreq = await selectDropdown(sapPage, t, 'Monthly');
      parts.push(`${t} set to: ${gotFreq}`);
      break;
    } catch (e) {
      parts.push(`could not set "${t}" to Monthly: ${(e as Error).message}`);
    }
  }
  await handleKnownPopups(sapPage, SAFE_POPUP, () => {});

  parts.push(`\n===== SCREEN BODY TEXT AFTER Variable + Monthly =====\n${await bodyText(sapPage)}`);

  // Find the Reference Interest Rate field and read its F4 search help.
  const refRateTitles = ['Reference Interest Rate', 'Ref.Interest Rate', 'Reference Int. Rate'];
  let opened = false;
  let usedTitle = '';
  for (const t of refRateTitles) {
    const count = await sapPage.locator(`input[title="${t}"]`).count();
    if (count > 0) {
      usedTitle = t;
      try {
        await openValueHelp(sapPage, t);
        opened = true;
      } catch (e) {
        parts.push(`field "${t}" found but F4 did not open: ${(e as Error).message}`);
      }
      break;
    }
  }

  if (!usedTitle) {
    parts.push('\nNo "Reference Interest Rate" field found on screen under the titles tried.');
  } else if (opened) {
    const help = await readSearchHelp(sapPage);
    parts.push(`\n===== F4 SEARCH HELP: "${usedTitle}" =====`);
    parts.push(`total reported: ${help.total ?? 'unknown'}`);
    parts.push(`header: ${help.header.join(' | ')}`);
    for (const row of help.rows) parts.push(`  ${row.join(' | ')}`);
    await closeValueHelp(sapPage);

    // Type the chosen rate directly, the same way probe-security-class.spec.ts
    // types an id found via F4 rather than clicking a grid row - still no
    // save, just finding out what else the screen then demands.
    await setFieldVerified(sapPage, usedTitle, 'RBI_REPO');
    await pressKey(sapPage, 'Enter');
    const pop = await handleKnownPopups(sapPage, SAFE_POPUP, (s) => parts.push(`popup: ${s}`));
    parts.push(`\nafter setting "${usedTitle}" = RBI_REPO and Enter: blocked=${pop.blocked ?? 'none'}`);

    parts.push(`\n===== SCREEN BODY TEXT AFTER Reference Interest Rate set =====\n${await bodyText(sapPage)}`);

    const dump = await dumpScreen(sapPage, 'discover-ftr-1000-22a-variable-rate-after-refrate', { full: true });
    parts.push(`\n===== CONTROLS AFTER Reference Interest Rate set (${dump.controls.length}) =====`);
    for (const c of dump.controls) {
      parts.push(`  ${JSON.stringify(c)}`);
    }

    for (const t of ['+/-', 'Interest Markup/Markdown', '1st Int. Rate', 'Interest Rate for the First Period']) {
      const count = await sapPage.locator(`input[title="${t}"]`).count();
      if (count > 0) {
        const val = await readField(sapPage, t).catch(() => '(unreadable)');
        parts.push(`field "${t}" present, current value: "${val}"`);
      }
    }
  }

  writeArtifact('discover-ftr-1000-22a-variable-rate.txt', parts.join('\n'));
  console.log('written: results/web/discover-ftr-1000-22a-variable-rate.txt');
  console.log(parts.join('\n'));
});
