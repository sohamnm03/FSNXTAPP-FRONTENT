import { test, expect } from '../fixtures';
import { openTransaction, setFieldVerified, setField, setCheckbox, clickButton, bodyText, dumpScreen } from '../webgui';
import { assertDevSystem, makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: TC-009's TBB1 test run (deal 160246, company 1000)
 * raised an "Information Overview" popup - "Logs and Messages: Posting Log /
 * Messages", both green-marked - that TC-002 (company 9800) never showed.
 * Before deciding whether it is safe to auto-close, read what it actually
 * says. Still a test run (Test Run stays ON throughout) - nothing is posted.
 *
 *   npx playwright test --project=exploratory tests/discover-tbb1-info-popup.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-tbb1-info-popup-log.txt');
});

test('DISCOVERY: TBB1 Information Overview popup content (deal 160246, test run)', async ({ sapPage }) => {
  test.setTimeout(120_000);

  await openTransaction(sapPage, 'TBB1');
  await assertDevSystem(sapPage, 'TBB1', log.note);

  await setFieldVerified(sapPage, 'Company Code', '1000', 0);
  await setFieldVerified(sapPage, 'Financial Transaction', '160246', 0);
  await setFieldVerified(sapPage, 'Payment or Delivery Date', '01.01.2026', 0);
  await setFieldVerified(sapPage, 'Posting Date in the Document', '01.01.2026', 1);
  await setCheckbox(sapPage, 'M0:46:::31:5', true, log.note); // Test Run stays ON

  await clickButton(sapPage, 'M0:50::btn[8]', 60_000);

  const popupText = await sapPage.evaluate(() => {
    const parts = Array.from(document.querySelectorAll('[id^="M1:"]'));
    if (!parts.length) return null;
    let node: HTMLElement | null = parts[0] as HTMLElement;
    let best = '';
    for (let i = 0; i < 8 && node; i++) {
      const t = (node.innerText ?? '').trim();
      if (t.length > best.length && t.length < 3000) best = t;
      node = node.parentElement;
    }
    return best;
  });
  log.note(`popup text: ${popupText}`);

  // Single click just selects the tree node; double-click didn't navigate
  // either. Try click-to-select then Enter (the a11y hint says "Press Enter
  // to trigger an action").
  const postingLog = sapPage.locator('[id^="M1:"]', { hasText: 'Posting Log' }).first();
  await postingLog.click({ force: true, timeout: 8000 }).catch((e) => log.note(`Posting Log click failed: ${e}`));
  await sapPage.waitForTimeout(500);
  await sapPage.keyboard.press('Enter').catch((e) => log.note(`Enter failed: ${e}`));
  await sapPage.waitForTimeout(1500);
  const afterPostingLog = await bodyText(sapPage);
  log.note(`--- after click+Enter on Posting Log ---\n${afterPostingLog.slice(0, 2000)}`);
  await dumpScreen(sapPage, 'discover-tbb1-posting-log', { full: true });

  // The icons sit at grid#C102#<row>,<col>#icp - so this is an ALV grid, not a
  // tree. Enumerate its cells and click the "Posting Log" text cell itself.
  const cells = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[id*="grid#C102#"]'))
      .map((el) => ({
        id: el.id,
        tag: el.tagName,
        text: (el.textContent ?? '').trim().slice(0, 40),
      }))
      .filter((c) => c.id),
  );
  log.note(`grid cells: ${JSON.stringify(cells, null, 2)}`);

  const logCell = cells.find((c) => /posting log/i.test(c.text));
  if (logCell) {
    log.note(`clicking grid cell ${logCell.id}`);
    await sapPage.locator(`[id="${logCell.id}"]`).first()
      .click({ force: true, timeout: 8000 })
      .catch((e) => log.note(`cell click failed: ${e}`));
    await sapPage.waitForTimeout(2000);
    const afterCell = await bodyText(sapPage);
    log.note(`--- after clicking the Posting Log grid cell ---\n${afterCell.slice(0, 3000)}`);
    await dumpScreen(sapPage, 'discover-tbb1-posting-log-open', { full: true });
  }

  const pageCount = sapPage.context().pages().length;
  log.note(`open pages/tabs in context: ${pageCount}`);
  for (const p of sapPage.context().pages()) log.note(`  page url: ${p.url()}`);

  const markers = await sapPage.evaluate(() => {
    return Array.from(document.querySelectorAll('[id^="M1:"] use'))
      .map((el) => ({
        href: el.getAttribute('href') ?? el.getAttribute('xlink:href'),
        svgId: el.closest('svg')?.id ?? '',
        rowText: (el.closest('svg')?.parentElement?.parentElement?.textContent ?? '').trim().slice(0, 60),
      }));
  });
  log.note(`marker elements: ${JSON.stringify(markers, null, 2)}`);

  expect(popupText, 'popup must have had some text').toBeTruthy();
});
