import { test, expect } from '../fixtures';
import {
  openTransaction, setField, setFieldVerified, pressKey, screenInfo,
  handleKnownPopups, writeArtifact, settle,
} from '../webgui';

/**
 * READ-ONLY discovery, pass 2: the Frequency Indicator dropdown.
 *
 * Pass 1 found the field holding "At End of Term". The first attempt to type
 * into it timed out, and the element explains why:
 *
 *   <input ct="CB" readonly aria-haspopup="true"
 *          aria-roledescription="Dropdown List Box"
 *          aria-controls="VTG_IRATE_STRUCTURE-SRHYTHMSAPLFTR_IRATE"
 *          title="Frequency Indicator" value="At End of Term">
 *
 * It is a Dynpro dropdown list box (technical field SRHYTHM), not a text field:
 * readonly, so `pressSequentially` can never set it. It has to be opened and an
 * entry picked. This pass finds out how the list renders and what it offers,
 * then selects the monthly entry and records what the screen grows as a result.
 * Nothing is saved.
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;
const FREQ_ID = 'M0:46:2:3B256:5::3:16';

const DEAL = {
  companyCode: '9800', productType: '10B', transactionType: '200',
  partner: '400000003', startDate: '01.01.2026', endDate: '31.12.2026',
  amount: '100000', interestRate: '10', contractDate: '01.01.2026',
};

/** Every input + checkbox/radio, flat, for before/after comparison. */
async function snapshot(page: Parameters<typeof screenInfo>[0]) {
  return page.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const inputs = Array.from(document.querySelectorAll('input'))
      .filter(vis)
      .map((el) => {
        const e = el as HTMLInputElement;
        const r = e.getBoundingClientRect();
        return `input y=${Math.round(r.y)} x=${Math.round(r.x)} title="${e.title}" value="${e.value}" id=${e.id}`;
      });
    const toggles = Array.from(document.querySelectorAll('[role="checkbox"], [role="radio"]'))
      .filter(vis)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.getAttribute('role')} y=${Math.round(r.y)} checked=${el.getAttribute('aria-checked')} title="${(el as HTMLElement).title}" label="${el.getAttribute('aria-label') ?? (el.parentElement?.innerText ?? '').trim().slice(0, 50)}" id=${el.id}`;
      });
    return [...inputs, ...toggles];
  });
}

// Exploration, not regression: it drives a live transaction to look at a screen
// and asserts almost nothing. Off unless explicitly asked for, so `npm test`
// stays a suite of real checks. Findings are recorded in webgui.ts
// (selectDropdown) and results/web/discover-ftr-frequency.txt.
test.skip(process.env.DISCOVER !== '1', 'discovery spec - run with DISCOVER=1');

test('DISCOVERY: frequency dropdown options and month-end fields', async ({ sapPage }) => {
  test.setTimeout(600_000);
  const out: string[] = [];

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

  const before = await snapshot(sapPage);
  out.push(`=== BEFORE (${before.length} controls) ===\n${before.join('\n')}`);

  // Is the option list already in the DOM (aria-controls target), or built on open?
  const listBefore = await sapPage.evaluate((id) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return { found: false };
    const target = el.getAttribute('aria-controls');
    const list = target ? document.getElementById(target) : null;
    return {
      found: true,
      ariaControls: target,
      listInDom: !!list,
      listHtml: list ? list.outerHTML.slice(0, 2000) : null,
    };
  }, FREQ_ID);
  out.push(`\n=== aria-controls target BEFORE opening ===\n${JSON.stringify(listBefore, null, 2)}`);

  // Open it. A readonly ITS combo ignores a plain click on the input in some
  // layouts, so escalate: force-click the input, then its wrapper.
  const combo = sapPage.locator(`[id="${FREQ_ID}"]`);
  await combo.click({ force: true, timeout: 10_000 }).catch(async () => {
    await sapPage.locator(`[id="${FREQ_ID}"]`).locator('xpath=..').click({ force: true });
  });
  await settle(sapPage, 8000);

  // Whatever opened, capture every option-shaped element on the page.
  const opened = await sapPage.evaluate(() => {
    const opts = Array.from(
      document.querySelectorAll('[role="option"], li, [class*="ListItem"], [class*="lsListbox"]'),
    )
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => ({
        id: el.id,
        role: el.getAttribute('role') ?? '',
        text: (el as HTMLElement).innerText?.trim().slice(0, 60) ?? '',
        cls: (el.className ?? '').toString().slice(0, 60),
      }))
      .filter((o) => o.text !== '');
    return opts.slice(0, 40);
  });
  out.push(`\n=== options visible after opening (${opened.length}) ===`);
  for (const o of opened) out.push(`  "${o.text}"  role=${o.role}  id=${o.id}  cls=${o.cls}`);

  // Which entry to select. The question this pass exists to answer is whether
  // "On Last Day of Month" carries the same frequency fields as "Monthly" - if
  // it does, one option satisfies "monthly frequency with month-end interest"
  // and no second field is needed.
  const want = process.env.FREQ_OPTION ?? 'Monthly';
  const monthly = opened.find((o) => o.text.trim().toLowerCase() === want.toLowerCase());
  out.push(`\nrequested option "${want}" => ${monthly ? JSON.stringify(monthly) : 'NOT FOUND'}`);

  if (monthly?.id) {
    await sapPage.locator(`[id="${monthly.id}"]`).click({ force: true });
    await settle(sapPage);
    await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));
    await pressKey(sapPage, 'Enter');
    await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));

    const freqNow = await sapPage
      .locator(`[id="${FREQ_ID}"]`)
      .inputValue()
      .catch(() => 'UNREADABLE');
    out.push(`\nFrequency Indicator now = "${freqNow}"`);

    const after = await snapshot(sapPage);
    out.push(`\n=== AFTER (${after.length} controls) ===\n${after.join('\n')}`);

    const strip = (s: string) => s.replace(/value="[^"]*"/, '').replace(/y=\d+ /, '');
    const beforeSet = new Set(before.map(strip));
    const added = after.filter((s) => !beforeSet.has(strip(s)));
    out.push(`\n=== CONTROLS THAT APPEARED (${added.length}) ===\n${added.join('\n')}`);
  }

  writeArtifact('discover-ftr-frequency.txt', out.join('\n'));
  console.log('written: results/web/discover-ftr-frequency.txt');
  // Nothing saved.
});
