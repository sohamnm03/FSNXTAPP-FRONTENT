import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, screenInfo, writeArtifact, captureEvidence,
  openValueHelp, readSearchHelp, closeValueHelp,
} from '../webgui';

/**
 * READ-ONLY: capture the FTR_CREATE ENTRY screen's own fields once company
 * code, product type and transaction type are set - before pressing Enter.
 *
 * Some product types need more than company code / product / txn type /
 * partner before they will even open a deal screen (01A demanded "Security
 * Class ID", which is not one of the four base fields every other product
 * type in this workspace has used). This discovers what the entry screen
 * itself is offering for a given product type, so the extra field can be
 * found and filled rather than guessed.
 *
 *   $env:DISCOVER="1"; $env:DEAL_PRODUCT="01A"; $env:DEAL_TXN="100"
 *   npx playwright test tests/discover-entry-screen.spec.ts
 */

test.skip(process.env.DISCOVER !== '1', 'discovery spec - run with DISCOVER=1');

const COMPANY_CODE = '9800';
const PRODUCT = (process.env.DEAL_PRODUCT ?? '').trim();
const TXN = (process.env.DEAL_TXN ?? '').trim();

test(`DISCOVERY: FTR_CREATE entry screen fields for ${PRODUCT || '?'}/${TXN || '?'}`, async ({ sapPage }) => {
  test.setTimeout(300_000);
  expect(PRODUCT).not.toBe('');
  expect(TXN).not.toBe('');

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });
  await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
  await setFieldVerified(sapPage, 'Product Type', PRODUCT);
  await setFieldVerified(sapPage, 'Financial Transaction Type', TXN);

  const fields = await sapPage.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return Array.from(document.querySelectorAll('input'))
      .filter(vis)
      .map((el) => {
        const e = el as HTMLInputElement;
        const r = e.getBoundingClientRect();
        return {
          title: e.title, value: e.value, y: Math.round(r.y),
          readonly: e.readOnly, hasHelp: e.getAttribute('aria-haspopup') === 'true',
        };
      })
      .sort((a, b) => a.y - b.y);
  });

  const out = [
    `FTR_CREATE entry screen: product ${PRODUCT}, txn type ${TXN}, company code ${COMPANY_CODE}`,
    '',
    ...fields.map(
      (f) => `  "${f.title}" = "${f.value}"${f.readonly ? ' (readonly)' : ''}${f.hasHelp ? ' [has F4]' : ''}`,
    ),
  ];
  writeArtifact(`entry-screen-${PRODUCT}-${TXN}.txt`, out.join('\n'));
  await captureEvidence(sapPage, `entry-screen-${PRODUCT}-${TXN}`);
  console.log(out.join('\n'));

  // If a field looks like it needs a value help, capture its F4 hit list too -
  // that answers "what values exist" in the same pass.
  const helpTitles = fields.filter((f) => f.hasHelp && !/company code|product type|financial transaction/i.test(f.title));
  for (const f of helpTitles) {
    try {
      await openValueHelp(sapPage, f.title);
      const help = await readSearchHelp(sapPage);
      writeArtifact(
        `f4-${PRODUCT}-${TXN}-${f.title.replace(/\W+/g, '-')}.txt`,
        [`F4 on "${f.title}" (product ${PRODUCT}/${TXN})`, `reports ${help.total} items, read ${help.rows.length}`, '', ...help.rows.map((r) => r.join(' | '))].join('\n'),
      );
      console.log(`F4 "${f.title}": ${help.rows.length} rows (of ${help.total})`);
      console.log(help.rows.slice(0, 20).map((r) => r.join(' | ')).join('\n'));
      await closeValueHelp(sapPage);
    } catch (e) {
      console.log(`F4 "${f.title}": ${(e as Error).message.slice(0, 150)}`);
    }
  }
});
