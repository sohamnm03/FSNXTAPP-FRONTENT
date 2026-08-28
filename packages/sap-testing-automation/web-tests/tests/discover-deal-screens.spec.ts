import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, pressKey, screenInfo,
  writeArtifact, captureEvidence, settle, bodyText, handleKnownPopups,
} from '../webgui';

/**
 * READ-ONLY: capture the deal-entry screen (fields, dropdowns, tabs) for one
 * product type / transaction type combination, without saving anything.
 *
 * Reused across every business area this run needs to cover - money market,
 * securities, trade finance, foreign exchange - so each one's screen shape is
 * paid for once and recorded, rather than rediscovered by a later case. Same
 * method as TC-003's ftr-variant-fields.txt: read each field's own listbox out
 * of the DOM, never guess an id.
 *
 * Writes results/web/deal-screen-<PT>-<TT>.txt. Nothing is saved to SAP.
 *
 *   $env:DISCOVER="1"
 *   $env:DEAL_PRODUCT="51A"; $env:DEAL_TXN="100"
 *   npx playwright test tests/discover-deal-screens.spec.ts
 *
 * Some product types (measured: 22B/securities) need more than the four base
 * entry fields before Enter will open a deal screen at all - a Security Class
 * ID, in that case. DEAL_EXTRA supplies "Title=Value" pairs for those, applied
 * on the entry screen before Enter.
 *   $env:DEAL_EXTRA="Security Class ID Number=200000"
 */

test.skip(process.env.DISCOVER !== '1', 'discovery spec - run with DISCOVER=1');

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;
const COMPANY_CODE = '9800';
const PARTNER = process.env.DEAL_PARTNER ?? '400000003';

const PRODUCT = (process.env.DEAL_PRODUCT ?? '').trim();
const TXN = (process.env.DEAL_TXN ?? '').trim();
const EXTRA: Array<[string, string]> = (process.env.DEAL_EXTRA ?? '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [t, v] = s.split('=');
    return [t.trim(), (v ?? '').trim()];
  });

test(`DISCOVERY: deal screen for ${PRODUCT || '?'}/${TXN || '?'}`, async ({ sapPage }) => {
  test.setTimeout(600_000);
  expect(PRODUCT, 'set DEAL_PRODUCT').not.toBe('');
  expect(TXN, 'set DEAL_TXN').not.toBe('');

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  expect(info.system, 'must be DS4').toContain('DS4');
  expect(info.client, 'must be client 100').toContain('100');

  await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });
  await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
  await setFieldVerified(sapPage, 'Product Type', PRODUCT);
  await setFieldVerified(sapPage, 'Financial Transaction Type', TXN);
  await setFieldVerified(sapPage, 'Business Partner Number', PARTNER);
  for (const [title, value] of EXTRA) {
    await setFieldVerified(sapPage, title, value);
  }
  await pressKey(sapPage, 'Enter');

  const afterEntry = await bodyText(sapPage);
  const errLine = afterEntry.split('\n').map((l) => l.trim()).find((l) => /^Error:/i.test(l));

  const info2 = await screenInfo(sapPage);
  await captureEvidence(sapPage, `deal-screen-${PRODUCT}-${TXN}-entry`);

  if (errLine) {
    writeArtifact(
      `deal-screen-${PRODUCT}-${TXN}.txt`,
      `FTR_CREATE entry screen refused ${PRODUCT}/${TXN} (company code ${COMPANY_CODE}, partner ${PARTNER}, extra ${JSON.stringify(EXTRA)})\n` +
        `screen: ${JSON.stringify(info2)}\nmessage: ${errLine}\n`,
    );
    console.log(`REFUSED at entry: ${errLine}`);
    return;
  }

  await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));
  await settle(sapPage, 15_000);

  const info3 = await screenInfo(sapPage);
  const stillEntry = info3.screen === info2.screen && info2.screen !== '';

  const fields = await sapPage.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return Array.from(document.querySelectorAll('input'))
      .filter(vis)
      .map((el) => {
        const e = el as HTMLInputElement;
        const listId = e.getAttribute('aria-controls');
        const list = listId ? document.getElementById(listId) : null;
        const options = list
          ? Array.from(list.querySelectorAll('[role="option"]')).map((o) => ({
              text: (o.textContent ?? '').trim(),
              key: o.getAttribute('data-itemkey') ?? '',
            }))
          : [];
        const r = e.getBoundingClientRect();
        return {
          title: e.title, value: e.value, y: Math.round(r.y),
          kind: listId ? 'dropdown' : e.readOnly ? 'readonly-text' : 'text',
          options,
        };
      })
      .sort((a, b) => a.y - b.y);
  });

  const tabs = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]')).map((t) => (t as HTMLElement).innerText.trim()).filter(Boolean),
  );

  const dropdowns = fields.filter((f) => f.kind === 'dropdown');
  const texts = fields.filter((f) => f.kind !== 'dropdown');

  const out: string[] = [
    `Deal screen: product ${PRODUCT}, txn type ${TXN}, company code ${COMPANY_CODE}, partner ${PARTNER}, extra ${JSON.stringify(EXTRA)}`,
    `screen after Enter: ${JSON.stringify(info3)}`,
    `still on entry screen: ${stillEntry}`,
    '',
    `===== TABS (${tabs.length}) =====`,
    ...tabs.map((t) => `  ${t}`),
    '',
    `===== DROPDOWNS (${dropdowns.length}) =====`,
  ];
  for (const d of dropdowns) {
    out.push('', `"${d.title}"   [current: ${d.value}]`);
    for (const o of d.options) out.push(`    key=${(o.key || '?').padEnd(4)} "${o.text}"`);
    if (d.options.length === 0) out.push('    (no options found in the DOM)');
  }
  out.push('', `===== TEXT FIELDS (${texts.length}) =====`);
  for (const t of texts) out.push(`  "${t.title}" = "${t.value}"${t.kind === 'readonly-text' ? '  (readonly)' : ''}`);

  writeArtifact(`deal-screen-${PRODUCT}-${TXN}.txt`, out.join('\n'));
  await captureEvidence(sapPage, `deal-screen-${PRODUCT}-${TXN}-filled`);
  console.log(`${PRODUCT}/${TXN}: tabs=${tabs.length} dropdowns=${dropdowns.length} texts=${texts.length}`);
  console.log(`screen: ${JSON.stringify(info3)}`);
});
