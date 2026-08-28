import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo,
  writeArtifact, settle, selectDropdown, clickButton, handleKnownPopups,
} from '../webgui';

/** READ-ONLY probe: which tab on the 38A/100 LC deal screen holds "General Valuation Class"? */

test.skip(process.env.DISCOVER !== '1', 'probe - run with DISCOVER=1');

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;

test('PROBE: General Valuation Class location on 38A/100', async ({ sapPage }) => {
  test.setTimeout(300_000);

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await setFieldVerified(sapPage, 'Company Code', '9800');
  await setFieldVerified(sapPage, 'Product Type', '38A');
  await setFieldVerified(sapPage, 'Financial Transaction Type', '100');
  await setFieldVerified(sapPage, 'Business Partner Number', '400000003');
  await pressKey(sapPage, 'Enter');

  await setField(sapPage, 'Term From', '01.01.2026');
  await setField(sapPage, 'Amount as Text Field', '1000000');
  await setField(sapPage, 'Term To', '01.07.2026');
  await setField(sapPage, 'Contract Date', '01.01.2026');
  await setField(sapPage, 'Beneficiary', 'Test Beneficiary Pty Ltd');
  await selectDropdown(sapPage, 'Payment Term', 'By Sight Payment');
  await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));
  await settle(sapPage, 8000);

  const tabs = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]')).map((t) => ({
      id: t.id, text: (t as HTMLElement).innerText.trim(),
    })),
  );
  const out: string[] = [`tabs: ${JSON.stringify(tabs)}`];

  for (const tab of tabs) {
    if (!tab.text) continue;
    await clickButton(sapPage, tab.id, 10_000).catch(() => {});
    await settle(sapPage, 6000);
    const hasField = await sapPage.evaluate(
      () => document.querySelector('input[title="General Valuation Class"]') !== null,
    );
    out.push(`  ${tab.text}: has General Valuation Class = ${hasField}`);
    if (hasField) break;
  }

  writeArtifact('probe-38a-valuation-class.txt', out.join('\n'));
  console.log(out.join('\n'));
});
