import { test, expect } from '../fixtures';
import {
  openTransaction, setField, setFieldVerified, pressKey, screenInfo,
  handleKnownPopups, writeArtifact, settle,
} from '../webgui';

/**
 * READ-ONLY probe: why does the Term Category dropdown not open the way the
 * Frequency Indicator one does?
 *
 * Both are ct="CB" with an aria-controls listbox, and the same force-click that
 * opens Frequency Indicator leaves Term Category's list hidden - the option
 * elements are in the DOM but not visible, so clicking one fails. This records
 * the markup around both controls so the difference can be seen rather than
 * guessed at. Nothing is saved.
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;
const FREQ = 'Frequency Indicator';
const TERM = 'Term Category';

test.skip(process.env.DISCOVER !== '1', 'probe spec - run with DISCOVER=1');

test('PROBE: Term Category vs Frequency Indicator dropdown behaviour', async ({ sapPage }) => {
  test.setTimeout(600_000);
  const out: string[] = [];

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');

  await setFieldVerified(sapPage, 'Company Code', '9800');
  await setFieldVerified(sapPage, 'Product Type', '10B');
  await setFieldVerified(sapPage, 'Financial Transaction Type', '200');
  await setFieldVerified(sapPage, 'Business Partner Number', '400000003');
  await pressKey(sapPage, 'Enter');

  await setField(sapPage, 'Amount as Text Field', '100000');
  await setFieldVerified(sapPage, 'Term Start', '01.01.2026');
  await setFieldVerified(sapPage, 'End of Term', '31.12.2026');
  await setFieldVerified(sapPage, 'Contract Date', '01.01.2026');
  await handleKnownPopups(sapPage, SAFE_POPUP, () => {});

  /** Markup around a field, plus whether its listbox is currently on screen. */
  async function describe(title: string, label: string) {
    return sapPage.evaluate(
      ({ t }) => {
        const el = Array.from(document.querySelectorAll('input')).find(
          (i) => (i as HTMLInputElement).title === t,
        ) as HTMLInputElement | undefined;
        if (!el) return { found: false };

        const listId = el.getAttribute('aria-controls');
        const list = listId ? document.getElementById(listId) : null;
        const lr = list?.getBoundingClientRect();
        const ls = list ? window.getComputedStyle(list) : null;
        const er = el.getBoundingClientRect();

        return {
          found: true,
          inputHtml: el.outerHTML.slice(0, 400),
          inputBox: { x: Math.round(er.x), y: Math.round(er.y), w: Math.round(er.width), h: Math.round(er.height) },
          listId,
          listVisible: !!(lr && lr.width > 0 && lr.height > 0),
          listBox: lr ? { x: Math.round(lr.x), y: Math.round(lr.y), w: Math.round(lr.width), h: Math.round(lr.height) } : null,
          listDisplay: ls?.display,
          listVisibility: ls?.visibility,
          listClass: list?.className,
          // What the user would actually click to open it.
          parentHtml: (el.parentElement?.outerHTML ?? '').slice(0, 700),
        };
      },
      { t: title },
    ).then((r) => {
      out.push(`\n===== ${label} =====\n${JSON.stringify(r, null, 2)}`);
      return r;
    });
  }

  await describe(FREQ, 'FREQUENCY - before click');
  await describe(TERM, 'TERM CATEGORY - before click');

  // Click each the way selectDropdown does, then look again.
  for (const [title, label] of [[FREQ, 'FREQUENCY'], [TERM, 'TERM CATEGORY']] as const) {
    const loc = sapPage.locator(`input[title="${title}"]`).first();
    await loc.click({ force: true, timeout: 8000 }).catch((e) => {
      out.push(`\n${label}: click threw ${(e as Error).message.split('\n')[0]}`);
    });
    await settle(sapPage, 6000);
    await describe(title, `${label} - after force click on the input`);

    // Try the wrapper instead.
    await sapPage
      .locator(`input[title="${title}"]`)
      .first()
      .locator('xpath=..')
      .click({ force: true, timeout: 8000 })
      .catch((e) => out.push(`\n${label}: parent click threw ${(e as Error).message.split('\n')[0]}`));
    await settle(sapPage, 6000);
    await describe(title, `${label} - after click on the parent`);

    // And the keyboard route a combobox normally answers to.
    await sapPage.locator(`input[title="${title}"]`).first().press('Alt+ArrowDown').catch(() => {});
    await settle(sapPage, 6000);
    await describe(title, `${label} - after Alt+ArrowDown`);

    await sapPage.keyboard.press('Escape').catch(() => {});
    await settle(sapPage, 4000);
  }

  writeArtifact('probe-term-category.txt', out.join('\n'));
  console.log('written: results/web/probe-term-category.txt');
});
