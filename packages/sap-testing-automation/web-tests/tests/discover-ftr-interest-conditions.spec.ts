import { test, expect } from '../fixtures';
import {
  openTransaction, setField, setFieldVerified, pressKey, screenInfo,
  handleKnownPopups, writeArtifact, bodyText, clickButton,
} from '../webgui';

/**
 * READ-ONLY discovery: where do interest frequency and the month-end indicator
 * live on the FTR_CREATE deal screen for a 10B term loan?
 *
 * Nothing here saves. It reaches the deal screen exactly as TC-002 does, then
 * inventories the controls TC-002 does not currently touch:
 *
 *  - inputs, with title AND screen position (the Dynpro label often sits in a
 *    separate element, so position is what pairs a field with its caption);
 *  - checkboxes and radios, which `dumpScreen` cannot see at all - ITS renders
 *    them as <div role="checkbox"> rather than <input type=checkbox>;
 *  - tabs and named buttons, since the interest conditions may sit behind
 *    "Conditions" rather than on the Structure tab.
 *
 * Delete this spec once the fields are pinned down in TC-002.
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;

const DEAL = {
  companyCode: '9800',
  productType: '10B',
  transactionType: '200',
  partner: '400000003',
  startDate: '01.01.2026',
  endDate: '31.12.2026',
  amount: '100000',
  interestRate: '10',
  contractDate: '01.01.2026',
};

/** Everything on screen that a test could address, with geometry. */
async function inventory(page: Parameters<typeof screenInfo>[0]) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const inputs = Array.from(document.querySelectorAll('input'))
      .filter(visible)
      .map((el) => {
        const e = el as HTMLInputElement;
        return { id: e.id, title: e.title, value: e.value, ...box(e) };
      });

    const toggles = Array.from(
      document.querySelectorAll('[role="checkbox"], [role="radio"]'),
    )
      .filter(visible)
      .map((el) => ({
        id: el.id,
        role: el.getAttribute('role') ?? '',
        checked: el.getAttribute('aria-checked'),
        title: (el as HTMLElement).title ?? '',
        label:
          el.getAttribute('aria-label') ??
          (el.parentElement?.innerText ?? '').trim().slice(0, 60),
        ...box(el),
      }));

    // Static text, positioned - this is what pairs with an input by geometry.
    const labels = Array.from(document.querySelectorAll('span, label, div'))
      .filter((el) => {
        if (!visible(el)) return false;
        if (el.children.length > 0) return false;
        const t = (el as HTMLElement).innerText?.trim() ?? '';
        return t.length > 0 && t.length < 40;
      })
      .map((el) => ({ text: (el as HTMLElement).innerText.trim(), ...box(el) }));

    const tabs = Array.from(document.querySelectorAll('[role="tab"]'))
      .filter(visible)
      .map((el) => ({ id: el.id, text: (el as HTMLElement).innerText.trim() }));

    const buttons = Array.from(document.querySelectorAll('[role="button"]'))
      .filter(visible)
      .map((el) => ({
        id: el.id,
        title: (el as HTMLElement).title ?? '',
        text: (el as HTMLElement).innerText?.trim().slice(0, 30) ?? '',
      }))
      .filter((b) => b.text !== '' || /interest|condition|frequency/i.test(b.title));

    return { inputs, toggles, labels, tabs, buttons };
  });
}

function render(name: string, inv: Awaited<ReturnType<typeof inventory>>) {
  const out: string[] = [`===== ${name} =====`];

  out.push(`\n--- inputs (${inv.inputs.length}) ---`);
  for (const i of inv.inputs) {
    // Pair each input with the nearest label to its left on the same row.
    const near = inv.labels
      .filter((l) => Math.abs(l.y - i.y) < 12 && l.x < i.x)
      .sort((a, b) => b.x - a.x)[0];
    out.push(
      `  y=${String(i.y).padStart(4)} x=${String(i.x).padStart(4)}  ` +
        `label="${near?.text ?? '?'}"  title="${i.title}"  value="${i.value}"  id=${i.id}`,
    );
  }

  out.push(`\n--- checkboxes / radios (${inv.toggles.length}) ---`);
  for (const t of inv.toggles) {
    const near = inv.labels
      .filter((l) => Math.abs(l.y - t.y) < 12)
      .sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x))[0];
    out.push(
      `  y=${String(t.y).padStart(4)} x=${String(t.x).padStart(4)}  ${t.role}  ` +
        `checked=${t.checked}  near="${near?.text ?? '?'}"  title="${t.title}"  ` +
        `label="${t.label}"  id=${t.id}`,
    );
  }

  out.push(`\n--- tabs (${inv.tabs.length}) ---`);
  for (const t of inv.tabs) out.push(`  ${t.text}  ->  ${t.id}`);

  out.push(`\n--- buttons (${inv.buttons.length}) ---`);
  for (const b of inv.buttons) out.push(`  "${b.text}"  ->  ${b.id}  (${b.title})`);

  return out.join('\n');
}

// Exploration, not regression - see the note in discover-ftr-frequency.spec.ts.
test.skip(process.env.DISCOVER !== '1', 'discovery spec - run with DISCOVER=1');

test('DISCOVERY: interest frequency + month-end fields on the 10B deal screen', async ({
  sapPage,
}) => {
  test.setTimeout(600_000);
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

  // Fill the deal exactly as TC-002 does, so the screen is in the state the
  // real flow reaches - conditions can render differently before the term is set.
  await setField(sapPage, 'Amount as Text Field', DEAL.amount);
  await setField(sapPage, 'Nominal Interest Rate', DEAL.interestRate);
  await setFieldVerified(sapPage, 'Term Start', DEAL.startDate);
  await setFieldVerified(sapPage, 'End of Term', DEAL.endDate);
  await setFieldVerified(sapPage, 'Contract Date', DEAL.contractDate);
  await pressKey(sapPage, 'Enter');
  await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));

  parts.push(render('STRUCTURE TAB (as TC-002 leaves it)', await inventory(sapPage)));
  parts.push(`\n\n===== STRUCTURE TAB body text =====\n${await bodyText(sapPage)}`);

  // The interest condition detail usually sits behind a "Conditions" button on
  // the application toolbar rather than on the Structure tab itself.
  const condBtn = await sapPage.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[role="button"]')) as HTMLElement[];
    const hit = els.find(
      (e) => /^condition/i.test((e.innerText ?? '').trim()) || /^condition/i.test(e.title ?? ''),
    );
    return hit ? hit.id : null;
  });
  console.log(`Conditions button: ${condBtn}`);

  if (condBtn) {
    await clickButton(sapPage, condBtn);
    parts.push(`\n\n${render('AFTER "Conditions"', await inventory(sapPage))}`);
    parts.push(`\n\n===== CONDITIONS body text =====\n${await bodyText(sapPage)}`);
  } else {
    parts.push('\n\nNo "Conditions" button found on the Structure tab.');
  }

  writeArtifact('discover-ftr-interest.txt', parts.join('\n'));
  console.log('written: results/web/discover-ftr-interest.txt');
  // Nothing saved. The session is abandoned on the deal screen.
});
