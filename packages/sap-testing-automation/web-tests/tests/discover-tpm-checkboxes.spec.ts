import { test, expect } from '../fixtures';
import { openTransaction, captureEvidence } from '../webgui';
import { assertDevSystem, makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: TPM44 and TPM1 expose "Test Run" and other checkboxes
 * that dumpScreen cannot see - WebGUI renders these as `[role="checkbox"]` /
 * `[role="radio"]` divs, not `<input type=checkbox>`, so the standard
 * `dumpScreen` query (input, select, textarea, button, [role="button"],
 * [role="tab"]) never captures them. discover-tpm-posting.spec.ts already
 * found every text-field title and id on both selection screens; this fills
 * the one gap it left - the checkbox ids, above all "Test Run", which is the
 * TBB1-style trap: left alone (it defaults ON) a "post" simulates, reports
 * success and writes nothing.
 *
 * Nothing is filled in and nothing is executed.
 *
 *   npx playwright test --project=exploratory tests/discover-tpm-checkboxes.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-tpm-checkboxes-log.txt');
});

for (const tcode of ['TPM44', 'TPM1'] as const) {
  test(`DISCOVERY: ${tcode} checkboxes`, async ({ sapPage }) => {
    test.setTimeout(120_000);

    await openTransaction(sapPage, tcode);
    const info = await assertDevSystem(sapPage, tcode, log.note);
    log.note(`${tcode} landed on screen ${info.screen}`);

    const boxes = await sapPage.evaluate(() => {
      const out: Array<{
        id: string; role: string; ariaChecked: string | null;
        rowText: string;
      }> = [];

      document.querySelectorAll('[role="checkbox"], [role="radio"]').forEach((el) => {
        const e = el as HTMLElement;
        const box = e.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) return;

        // The visible label lives as plain text in the same table row - walk up
        // to the nearest row-like ancestor and take its text, which is the only
        // reliable way to associate a positional checkbox id with what it says
        // on screen (no `for`/aria-labelledby is present on these controls).
        const row = e.closest('tr, [role="row"]') ?? e.parentElement?.parentElement ?? e.parentElement;
        const rowText = (row?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);

        out.push({
          id: e.id || '',
          role: e.getAttribute('role') || '',
          ariaChecked: e.getAttribute('aria-checked'),
          rowText,
        });
      });

      return out;
    });

    log.note(`${tcode}: ${boxes.length} checkbox/radio controls found`);
    for (const b of boxes) {
      log.note(`  [${b.role}] id="${b.id}" checked=${b.ariaChecked}  row="${b.rowText}"`);
    }

    await captureEvidence(sapPage, `discover-${tcode.toLowerCase()}-checkboxes`);

    expect(boxes.length, `${tcode} must expose at least one checkbox/radio`).toBeGreaterThan(0);
  });
}
