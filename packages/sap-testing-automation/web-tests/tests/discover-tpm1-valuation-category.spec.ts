import { test, expect } from '../fixtures';
import { openTransaction, field } from '../webgui';
import { assertDevSystem, makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: TPM1 refuses to execute with `Make an entry in
 * mandatory field "Valuation Category"` - a field the screen model does not
 * carry yet, and the reason TC-009's first "passing" TPM1 run had in fact
 * executed nothing at all. Its dump value was "  ?", which is a dropdown
 * placeholder rather than free text, so read its option list.
 *
 *   npx playwright test --project=exploratory tests/discover-tpm1-valuation-category.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-tpm1-valuation-category-log.txt');
});

test('DISCOVERY: TPM1 Valuation Category options', async ({ sapPage }) => {
  test.setTimeout(90_000);

  await openTransaction(sapPage, 'TPM1');
  await assertDevSystem(sapPage, 'TPM1', log.note);

  const el = field(sapPage, 'Valuation Category', 0);
  const ariaControls = await el.getAttribute('aria-controls');
  log.note(`Valuation Category aria-controls=${ariaControls} value="${await el.inputValue()}"`);

  await el.click({ force: true, timeout: 10_000 }).catch(() => {});
  await sapPage.waitForTimeout(1000);
  let open = await sapPage.evaluate((id) => {
    const l = id ? document.getElementById(id) : null;
    if (!l) return false;
    const r = l.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, ariaControls);
  if (!open) {
    await el.press('Alt+ArrowDown').catch(() => {});
    await sapPage.waitForTimeout(1000);
    open = await sapPage.evaluate((id) => {
      const l = id ? document.getElementById(id) : null;
      if (!l) return false;
      const r = l.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }, ariaControls);
  }
  log.note(`option list open: ${open}`);

  const options = await sapPage.evaluate((id) => {
    const l = id ? document.getElementById(id) : null;
    if (!l) return [];
    return Array.from(l.querySelectorAll('[role="option"]')).map((o) => (o.textContent ?? '').trim());
  }, ariaControls);
  log.note(`Valuation Category options: ${JSON.stringify(options, null, 2)}`);

  expect(options.length, 'Valuation Category must offer at least one option').toBeGreaterThan(0);
});
