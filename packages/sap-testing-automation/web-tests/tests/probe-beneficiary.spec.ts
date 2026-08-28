import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, pressKey, screenInfo, field, settle,
  writeArtifact, captureEvidence, readSearchHelp, closeValueHelp,
} from '../webgui';

/**
 * READ-ONLY probe: does any Business Partner with a Vendor role exist on this
 * system? "BP role of 0400000003 does not belong to the vendor" ruled out the
 * partner used everywhere else in this workspace as Beneficiary on a Letter
 * of Credit - the field wants a vendor-role partner specifically. Its own F4
 * returned 0 rows when scoped to this transaction; this clears every filter
 * the same way the Security Class ID probe did, to see the real universe.
 */

test.skip(process.env.DISCOVER !== '1', 'probe - run with DISCOVER=1');

test('PROBE: Beneficiary F4 with filters cleared, 38A/100', async ({ sapPage }) => {
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

  const el = field(sapPage, 'Beneficiary');
  await el.click();
  await settle(sapPage, 5000);
  await sapPage.keyboard.press('F4');
  await settle(sapPage, 20_000);

  const filterIds = await sapPage.evaluate(() => {
    const dialog = Array.from(document.querySelectorAll('[id^="SearchHelp"][role="dialog"]')).find(
      (d) => d.getBoundingClientRect().width > 0,
    );
    return dialog ? Array.from(dialog.querySelectorAll('input')).map((i) => i.id) : [];
  });
  console.log(`filter inputs: ${JSON.stringify(filterIds)}`);

  for (const id of filterIds) {
    const loc = sapPage.locator(`[id="${id}"]`);
    await loc.click().catch(() => {});
    await loc.press('Control+a').catch(() => {});
    await loc.press('Delete').catch(() => {});
  }
  await sapPage.evaluate(() => {
    const dialog = Array.from(document.querySelectorAll('[id^="SearchHelp"][role="dialog"]')).find(
      (d) => d.getBoundingClientRect().width > 0,
    );
    const go = dialog
      ? (Array.from(dialog.querySelectorAll('[role="button"]')).find((b) => /go/i.test(b.textContent ?? '')) as HTMLElement | null)
      : null;
    go?.click();
  });
  await settle(sapPage, 20_000);

  const help = await readSearchHelp(sapPage);
  writeArtifact(
    'probe-beneficiary-cleared.txt',
    [`Beneficiary F4, filters cleared: ${help.rows.length} rows (of ${help.total})`, '', ...help.rows.slice(0, 60).map((r) => r.join(' | '))].join('\n'),
  );
  console.log(`${help.rows.length} rows (of ${help.total})`);
  console.log(help.rows.slice(0, 30).map((r) => r.join(' | ')).join('\n'));
  await captureEvidence(sapPage, 'probe-beneficiary-cleared');
  await closeValueHelp(sapPage);
});
