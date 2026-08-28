import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, screenInfo, writeArtifact, field, settle,
  captureEvidence, readSearchHelp, closeValueHelp, bodyText, pressKey, readField,
} from '../webgui';

/**
 * READ-ONLY probe, in two parts.
 *
 * Part 1: does the Security Class ID F4's default filter depend on product
 * type at all? Measured on 01A: clearing the filter surfaced classes tagged
 * product type 22B. If the same "clear and Go" on a 22B-scoped field ALSO
 * shows classes across every product type (not just 22B), the field's default
 * restriction has nothing to do with the deal's own product type - it is
 * something else (e.g. a status flag) defaulting to a value nothing matches.
 *
 * Part 2: with a real class id typed directly (not chosen from a working F4,
 * since none was available), does FTR_CREATE accept it and open a deal
 * screen for 22B/100? This is still read-only - Enter derives the screen, it
 * does not save.
 */

test.skip(process.env.DISCOVER !== '1', 'probe - run with DISCOVER=1');

const CLASS_ID = process.env.CLASS_ID ?? '200000';

test('PROBE: Security Class ID filter scope + typed-id entry for 22B/100', async ({ sapPage }) => {
  test.setTimeout(300_000);

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });
  await setFieldVerified(sapPage, 'Company Code', '9800');
  await setFieldVerified(sapPage, 'Product Type', '22B');
  await setFieldVerified(sapPage, 'Financial Transaction Type', '100');

  // ---- Part 1: clear-filter F4 scoped to 22B ----
  const el = field(sapPage, 'Security Class ID Number');
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
    const go = dialog ? (Array.from(dialog.querySelectorAll('[role="button"]')).find((b) =>
      /go/i.test(b.textContent ?? ''),
    ) as HTMLElement | null) : null;
    go?.click();
  });
  await settle(sapPage, 20_000);
  const help = await readSearchHelp(sapPage);

  const productTypesSeen = [...new Set(help.rows.map((r) => r[4] ?? r.find((c) => /^[0-9A-Z]{3}$/.test(c)) ?? ''))];
  writeArtifact(
    'probe-security-class-22B.txt',
    [
      `Security Class ID F4, product context 22B/100, filters cleared: ${help.rows.length} rows (of ${help.total})`,
      `product-type-like column values seen: ${productTypesSeen.join(', ')}`,
      '',
      ...help.rows.slice(0, 50).map((r) => r.join(' | ')),
    ].join('\n'),
  );
  console.log(`cleared filter: ${help.rows.length} rows (of ${help.total}); product types seen: ${productTypesSeen.join(', ')}`);
  await captureEvidence(sapPage, 'probe-security-class-22B-cleared');
  await closeValueHelp(sapPage);

  // ---- Part 2: type a known class id directly and see if Enter accepts it ----
  await setFieldVerified(sapPage, 'Security Class ID Number', CLASS_ID);
  await setFieldVerified(sapPage, 'Business Partner Number', '400000003');
  await pressKey(sapPage, 'Enter');

  const text = await bodyText(sapPage);
  const errLine = text.split('\n').map((l) => l.trim()).find((l) => /^Error:/i.test(l));
  const info2 = await screenInfo(sapPage);
  await captureEvidence(sapPage, 'probe-security-class-22B-typed-entry');

  const out = [
    `Typed Security Class ID "${CLASS_ID}" directly into 22B/100 entry screen, partner 400000003.`,
    `screen after Enter: ${JSON.stringify(info2)}`,
    errLine ? `REFUSED: ${errLine}` : 'no error line found - screen may have advanced',
    `Security Class ID Number field now reads: "${await readField(sapPage, 'Security Class ID Number').catch(() => '?')}"`,
  ];
  writeArtifact('probe-security-class-22B-typed.txt', out.join('\n'));
  console.log(out.join('\n'));
});
