import { test } from '../fixtures';
import { dumpScreen, clickButton, field } from '../webgui';
import { openDealEntry, fillTermLoan } from '../modules/treasury';
import { makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: "General Valuation Class" (id M0:46:2:3B259:1::2:16,
 * Administr. tab) has an empty `role` attribute in the dump, same as
 * "Frequency Indicator" (a dropdown) and "Rounding Category" (also a
 * dropdown) elsewhere on this deal screen - so it may need selectDropdown()
 * rather than setField(). This types the coded value found via TPM44/TPM1's
 * F4 value help ('0005') into it and reads back what SAP does with it.
 * Nothing is saved.
 *
 *   npx playwright test --project=exploratory tests/discover-ftr-gvc-field-type.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-ftr-gvc-field-type-log.txt');
});

test('DISCOVERY: General Valuation Class field behaviour', async ({ sapPage }) => {
  test.setTimeout(120_000);

  const spec = {
    companyCode: '1000', productType: '22A', transactionType: '100', partner: '700000453',
    amount: '100000', currency: 'INR', interestRate: '10',
    startDate: '01.01.2026', endDate: '31.12.2026', contractDate: '01.01.2026',
  };
  const ctx = { note: log.note, tag: 'discover-gvctype' };
  await openDealEntry(sapPage, spec, ctx);
  await fillTermLoan(sapPage, spec, ctx);
  await clickButton(sapPage, 'M0:46:2::0:3-title');

  const gvcTitle = 'General Valuation Class';
  const el = field(sapPage, gvcTitle, 0);
  const ariaControls = await el.getAttribute('aria-controls');
  const ariaHaspopup = await el.getAttribute('aria-haspopup');
  const readonly = await el.getAttribute('readonly');
  log.note(`field attrs before typing: aria-controls=${ariaControls} aria-haspopup=${ariaHaspopup} readonly=${readonly}`);

  // It's a dropdown (aria-controls + aria-haspopup + readonly), not free text -
  // open its option list the same way selectDropdown() does and read what's there.
  await el.click({ force: true, timeout: 10_000 }).catch(() => {});
  await sapPage.waitForTimeout(1000);
  let listOpen = await sapPage.evaluate((id) => {
    const list = document.getElementById(id);
    if (!list) return false;
    const r = list.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, ariaControls);
  if (!listOpen) {
    await el.press('Alt+ArrowDown').catch(() => {});
    await sapPage.waitForTimeout(1000);
    listOpen = await sapPage.evaluate((id) => {
      const list = document.getElementById(id);
      if (!list) return false;
      const r = list.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }, ariaControls);
  }
  log.note(`dropdown list open: ${listOpen}`);

  const options = await sapPage.evaluate((id) => {
    const list = document.getElementById(id);
    if (!list) return [];
    return Array.from(list.querySelectorAll('[role="option"]')).map((o) => (o.textContent ?? '').trim());
  }, ariaControls);
  log.note(`available options: ${JSON.stringify(options)}`);

  await dumpScreen(sapPage, 'discover-gvc-after-type', { full: false });
});
