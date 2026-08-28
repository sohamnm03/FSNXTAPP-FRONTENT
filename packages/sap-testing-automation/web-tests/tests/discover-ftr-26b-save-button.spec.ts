import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, setField, pressKey, screenInfo,
  writeArtifact, captureEvidence, dismissLiveSearch, clickButton, selectDropdown,
} from '../webgui';

/**
 * READ-ONLY discovery: what is the real Save control on the 26B deal screen
 * (SAPLTTM_UI_FRAMEWORK/1110)?
 *
 * TC-019's first live attempt clicked whatever `findSaveButton` resolved
 * (title "(Ctrl+S)" or text starting "Save") and nothing happened - the
 * Transaction field still read the internal placeholder afterwards. The
 * screenshot shows a visually different "Save" button in the status/message
 * bar at the bottom, styled unlike the classic ITS toolbar buttons
 * elsewhere in this workspace. This finds every "Save"-labelled clickable
 * element on screen, in which document/frame, and its exact attributes -
 * not another guess.
 *
 * WRITES NOTHING - never presses anything, only reads.
 */

test.skip(process.env.DISCOVER !== '1', 'discovery - run with DISCOVER=1');

const COMPANY_CODE = process.env.COMPANY_CODE ?? '9990';
const CLASS_ID = process.env.CLASS_ID ?? '300025';
const PARTNER = process.env.PARTNER ?? '400000003';

const out: string[] = [];
const note = (s: string) => { out.push(s); console.log(s); };

test('DISCOVER: real Save control on the 26B deal screen', async ({ sapPage }) => {
  test.setTimeout(300_000);

  await openTransaction(sapPage, 'FTR_CREATE');
  const session = await screenInfo(sapPage);
  expect(session.system).toContain('DS4');
  expect(session.client).toContain('100');

  await expect(sapPage.locator('input[title="Company Code"]')).toBeVisible({ timeout: 30_000 });
  await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Product Type', '26B');
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Financial Transaction Type', '100');
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Security Class ID Number', CLASS_ID);
  await dismissLiveSearch(sapPage);
  await setFieldVerified(sapPage, 'Business Partner Number', PARTNER);
  await dismissLiveSearch(sapPage);
  await pressKey(sapPage, 'Enter');

  const info = await screenInfo(sapPage);
  if (!info.screen?.includes('SAPLTTM_UI_FRAMEWORK')) {
    throw new Error(`did not reach the deal screen - landed on ${info.screen}`);
  }

  await selectDropdown(sapPage, 'General Valuation Class', 'Short Term');
  await setField(sapPage, 'Securities Account', '1000');
  await setField(sapPage, 'Number of Units as Text', '1000');
  await setField(sapPage, 'Security Price Without Currency Ref. with Unit Quotation', '100', 0);
  await pressKey(sapPage, 'Enter');
  await clickButton(sapPage, 'M0:48::btn[6]'); // Check, to reach the same state as the failed run

  await captureEvidence(sapPage, 'ftr-26b-save-discovery', 'state before inspecting Save controls');

  // ---- every frame ----
  note(`frames: ${sapPage.frames().map((f) => f.url()).join(' | ')}`);

  // ---- every "Save"-labelled clickable element in the top document ----
  const topLevel = await sapPage.evaluate(() => {
    const out: Record<string, unknown>[] = [];
    document.querySelectorAll('*').forEach((el) => {
      const text = (el.textContent ?? '').trim();
      const title = (el as HTMLElement).title ?? '';
      if (!/^save$/i.test(text) && !/save/i.test(title)) return;
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      out.push({
        tag: el.tagName, id: el.id, role: el.getAttribute('role'), title,
        text: text.slice(0, 30), classes: (el as HTMLElement).className,
        w: Math.round(box.width), h: Math.round(box.height),
      });
    });
    return out;
  });
  note(`\n--- "Save"-related elements in top document (${topLevel.length}) ---`);
  for (const e of topLevel) note(`  ${JSON.stringify(e)}`);

  // ---- check each iframe too ----
  for (const frame of sapPage.frames()) {
    if (frame === sapPage.mainFrame()) continue;
    try {
      const inFrame = await frame.evaluate(() => {
        const out: Record<string, unknown>[] = [];
        document.querySelectorAll('*').forEach((el) => {
          const text = (el.textContent ?? '').trim();
          const title = (el as HTMLElement).title ?? '';
          if (!/^save$/i.test(text) && !/save/i.test(title)) return;
          const box = el.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) return;
          out.push({ tag: el.tagName, id: el.id, role: el.getAttribute('role'), title, text: text.slice(0, 30) });
        });
        return out;
      });
      if (inFrame.length) {
        note(`\n--- "Save"-related elements in frame ${frame.url()} (${inFrame.length}) ---`);
        for (const e of inFrame) note(`  ${JSON.stringify(e)}`);
      }
    } catch (e) {
      note(`frame ${frame.url()}: could not evaluate (${e})`);
    }
  }

  note('\nNOTHING SAVED - no button was pressed.');
  writeArtifact('discover-ftr-26b-save-button.txt', out.join('\n'));
});
