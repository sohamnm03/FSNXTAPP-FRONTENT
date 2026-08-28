import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, screenInfo, writeArtifact, settle,
  clickButton, bodyText, pressKey,
} from '../webgui';

/**
 * READ-ONLY probe: what due dates does deal 1000228's own cash flow actually
 * carry? TBB1's test run (due-by 01.09.2026, posting 01.09.2026) found no
 * flow for this deal and returned to the selection screen instead of a
 * result list - this reads the deal's real Cash Flow tab in FTR_EDIT to see
 * what date the flow this case expected to post is actually dated.
 */

test.skip(process.env.DISCOVER !== '1', 'probe - run with DISCOVER=1');

const DEAL = process.env.DEAL_NO ?? '1000228';

test(`PROBE: cash flow dates for deal ${DEAL}`, async ({ sapPage }) => {
  test.setTimeout(300_000);

  await openTransaction(sapPage, 'FTR_EDIT');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await expect(sapPage.locator('input[title="Financial Transaction"]')).toBeVisible({ timeout: 30_000 });
  await setFieldVerified(sapPage, 'Company Code', '9800');
  await setFieldVerified(sapPage, 'Financial Transaction', DEAL);

  // Display, not settle - purely read-only.
  await pressKey(sapPage, 'Enter');
  await settle(sapPage, 15_000);

  // FTR_ENTRY/1000 is an overview with its own toolbar - "Settle" lives at a
  // fixed id (M0:46:::5:8, see TC-002/004-007), but Display is a separate
  // button. Dump every button so it does not have to be guessed.
  const buttons = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[role="button"]'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => ({
        id: el.id, text: (el.textContent ?? '').trim().slice(0, 30),
        title: (el as HTMLElement).title ?? '',
      }))
      .filter((b) => b.text || b.title),
  );
  const displayBtn = buttons.find((b) => /^display$/i.test(b.text) || /display/i.test(b.title));
  if (displayBtn) {
    await clickButton(sapPage, displayBtn.id, 15_000);
    await settle(sapPage, 10_000);
  }

  const tabs = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]')).map((t) => ({
      id: t.id, text: (t as HTMLElement).innerText.trim(),
    })),
  );
  const cashFlowTab = tabs.find((t) => t.text === 'Cash Flow');
  const out: string[] = [
    `screen: ${JSON.stringify(await screenInfo(sapPage))}`,
    `buttons on overview: ${JSON.stringify(buttons)}`,
    `display button: ${displayBtn ? JSON.stringify(displayBtn) : 'NOT FOUND'}`,
    `tabs: ${JSON.stringify(tabs)}`,
  ];

  if (cashFlowTab) {
    await clickButton(sapPage, cashFlowTab.id, 15_000);
    await settle(sapPage, 10_000);
    const text = await bodyText(sapPage);
    out.push('', '--- Cash Flow tab text ---', text.slice(0, 4000));
  } else {
    out.push('no Cash Flow tab found');
  }

  writeArtifact(`probe-cashflow-${DEAL}.txt`, out.join('\n'));
  console.log(out.join('\n').slice(0, 3000));
});
