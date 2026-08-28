import { test, expect } from '../fixtures';
import {
  openTransaction, setField, setFieldVerified, pressKey, screenInfo,
  handleKnownPopups, writeArtifact, captureEvidence,
} from '../webgui';

/**
 * READ-ONLY: capture every variable field on the 10B term-loan deal screen,
 * with the full list of values each will accept.
 *
 * The point is to pay the discovery cost once. Every dropdown on this screen
 * keeps its option list in the DOM under the id named by the input's
 * `aria-controls`, whether or not it has ever been opened - so the whole
 * variant surface can be read without clicking anything, and therefore without
 * any risk of changing the transaction.
 *
 * Writes results/web/ftr-variant-fields.txt. Nothing is saved to SAP.
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;

const DEAL = {
  companyCode: '9800', productType: '10B', transactionType: '200',
  partner: '400000003', startDate: '01.01.2026', endDate: '31.12.2026',
  amount: '100000', interestRate: '10', contractDate: '01.01.2026',
};

test.skip(process.env.DISCOVER !== '1', 'discovery spec - run with DISCOVER=1');

test('DISCOVERY: every variant field and its allowed values', async ({ sapPage }) => {
  test.setTimeout(600_000);

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await setFieldVerified(sapPage, 'Company Code', DEAL.companyCode);
  await setFieldVerified(sapPage, 'Product Type', DEAL.productType);
  await setFieldVerified(sapPage, 'Financial Transaction Type', DEAL.transactionType);
  await setFieldVerified(sapPage, 'Business Partner Number', DEAL.partner);
  await pressKey(sapPage, 'Enter');

  await setField(sapPage, 'Amount as Text Field', DEAL.amount);
  await setField(sapPage, 'Nominal Interest Rate', DEAL.interestRate);
  await setFieldVerified(sapPage, 'Term Start', DEAL.startDate);
  await setFieldVerified(sapPage, 'End of Term', DEAL.endDate);
  await setFieldVerified(sapPage, 'Contract Date', DEAL.contractDate);
  await pressKey(sapPage, 'Enter');
  await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));

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
              // data-itemkey is the Dynpro value behind the display text -
              // worth recording, it is what ends up in the table field.
              key: o.getAttribute('data-itemkey') ?? '',
            }))
          : [];
        const r = e.getBoundingClientRect();
        return {
          title: e.title,
          value: e.value,
          id: e.id,
          y: Math.round(r.y),
          kind: listId ? 'dropdown' : e.readOnly ? 'readonly-text' : 'text',
          listId: listId ?? '',
          options,
        };
      })
      .sort((a, b) => a.y - b.y);
  });

  const dropdowns = fields.filter((f) => f.kind === 'dropdown');
  const texts = fields.filter((f) => f.kind !== 'dropdown');

  const out: string[] = [
    'FTR_CREATE deal screen (TM_51 / SAPLFTR_IRATE 1100), product type 10B, txn type 200',
    'Captured read-only. Option lists come from each field\'s own aria-controls listbox.',
    '',
    `===== DROPDOWNS (${dropdowns.length}) - drive with selectDropdown() =====`,
  ];

  for (const d of dropdowns) {
    out.push('');
    out.push(`"${d.title}"   [current: ${d.value}]   ${d.listId}`);
    for (const o of d.options) {
      out.push(`    key=${(o.key || '?').padEnd(4)} "${o.text}"`);
    }
    if (d.options.length === 0) out.push('    (no options found in the DOM)');
  }

  out.push('', `===== TEXT FIELDS (${texts.length}) - drive with setField / setFieldVerified =====`);
  for (const t of texts) {
    out.push(`  "${t.title}" = "${t.value}"${t.kind === 'readonly-text' ? '  (readonly)' : ''}`);
  }

  writeArtifact('ftr-variant-fields.txt', out.join('\n'));
  await captureEvidence(sapPage, 'ftr-variant-fields-screen');
  console.log(`dropdowns: ${dropdowns.length}, text fields: ${texts.length}`);
  console.log('written: results/web/ftr-variant-fields.txt');
  // Nothing saved.
});
