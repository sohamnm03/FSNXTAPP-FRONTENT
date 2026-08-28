import { test, expect } from '../fixtures';
import { openTransaction, dumpScreen } from '../webgui';
import { assertDevSystem, makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: capture TPM44 (Key Date Valuation) and TPM1 (Accrual /
 * Deferral) posting screens as they land, before any test case exists for
 * either. Nothing is filled in and nothing is executed - this is only
 * recording the initial selection screen's fields and layout for later case
 * authoring, the same way discover-entry-screen.spec.ts did for FTR_CREATE.
 *
 *   npx playwright test --project=exploratory tests/discover-tpm-posting.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-tpm-posting-log.txt');
});

for (const tcode of ['TPM44', 'TPM1'] as const) {
  test(`DISCOVERY: ${tcode} posting screen`, async ({ sapPage }) => {
    test.setTimeout(120_000);

    await openTransaction(sapPage, tcode);
    const info = await assertDevSystem(sapPage, tcode, log.note);
    log.note(`${tcode} landed on screen ${info.screen}`);

    const dump = await dumpScreen(sapPage, `discover-${tcode.toLowerCase()}`, { full: true });
    log.note(`${tcode}: ${dump.controls.length} controls captured`);
    log.note(`  screenshot: evidence/screen-discover-${tcode.toLowerCase()}.png`);
    log.note(`  dump: results/web/screen-discover-${tcode.toLowerCase()}.txt`);

    expect(dump.controls.length, `${tcode} screen must expose at least one control`).toBeGreaterThan(0);
  });
}
