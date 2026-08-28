import { test, expect } from '../fixtures';
import { dumpScreen } from '../webgui';
import { openDealEntry, fillTermLoan } from '../modules/treasury';
import { makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: the previous attempt to switch to "Additional Tab" by
 * clicking id `M0:46:2::0:1-title` left the screen on "Structure" (title
 * unchanged). This inspects the DOM around that id to find the actual
 * clickable element / interaction the tab strip expects, then tries a few
 * approaches and checks which one actually switches the tab.
 *
 *   npx playwright test --project=exploratory tests/discover-ftr-tab-click.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-ftr-tab-click-log.txt');
});

test('DISCOVERY: how to switch the FTR_CREATE deal screen tab strip', async ({ sapPage }) => {
  test.setTimeout(120_000);

  const spec = {
    companyCode: '1000', productType: '22A', transactionType: '100', partner: '700000453',
    amount: '100000', currency: 'INR', interestRate: '10',
    startDate: '01.01.2026', endDate: '31.12.2026', contractDate: '01.01.2026',
  };
  const ctx = { note: log.note, tag: 'discover-tabclick' };
  await openDealEntry(sapPage, spec, ctx);
  const filled = await fillTermLoan(sapPage, spec, ctx);
  log.note(`deal screen filled, refused=${filled.refused}`);

  const info = await sapPage.evaluate(() => {
    const el = document.getElementById('M0:46:2::0:1-title');
    if (!el) return null;
    const describe = (e: Element | null, depth: number) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return {
        tag: e.tagName, id: e.id, role: e.getAttribute('role'),
        cls: e.className, tabIndex: (e as HTMLElement).tabIndex,
        w: r.width, h: r.height,
      };
    };
    const chain = [];
    let cur: Element | null = el;
    for (let i = 0; i < 4 && cur; i++) {
      chain.push(describe(cur, i));
      cur = cur.parentElement;
    }
    return chain;
  });
  log.note(`ancestor chain of M0:46:2::0:1-title: ${JSON.stringify(info, null, 2)}`);

  // "Structure"-tab-only text: if this disappears, the tab actually switched.
  const structureMarker = /Interest Structure/i;

  const titleEl = sapPage.locator('[id="M0:46:2::0:1-title"]').first();
  await titleEl.click({ force: true, timeout: 8000 }).catch((e) => log.note(`click failed: ${e}`));
  await sapPage.waitForTimeout(1500);
  let dump = await dumpScreen(sapPage, 'discover-tabclick-after-click', { full: false });
  log.note(`after plain click: structure marker present = ${structureMarker.test(dump.text)}`);

  if (structureMarker.test(dump.text)) {
    await titleEl.focus().catch(() => {});
    await sapPage.keyboard.press('Enter').catch((e) => log.note(`enter failed: ${e}`));
    await sapPage.waitForTimeout(1500);
    dump = await dumpScreen(sapPage, 'discover-tabclick-after-enter', { full: false });
    log.note(`after focus+Enter: structure marker present = ${structureMarker.test(dump.text)}`);
  }

  if (structureMarker.test(dump.text)) {
    // Try clicking the parent (without -title suffix).
    const parentId = 'M0:46:2::0:1';
    const parentEl = sapPage.locator(`[id="${parentId}"]`).first();
    const count = await parentEl.count();
    log.note(`parent element [id="${parentId}"] count=${count}`);
    if (count > 0) {
      await parentEl.click({ force: true, timeout: 8000 }).catch((e) => log.note(`parent click failed: ${e}`));
      await sapPage.waitForTimeout(1500);
      dump = await dumpScreen(sapPage, 'discover-tabclick-after-parent-click', { full: false });
      log.note(`after parent click: structure marker present = ${structureMarker.test(dump.text)}`);
    }
  }

  expect(structureMarker.test(dump.text), 'tab must have switched away from Structure').toBe(false);
});
