import { test, expect } from '../fixtures';
import { openTransaction, openValueHelp, readSearchHelp, closeValueHelp } from '../webgui';
import { assertDevSystem, makeLogger } from '../modules/session';

/**
 * READ-ONLY discovery: TC-009 asks for TPM44/TPM1's "Valuation Class" to be set
 * to "short term". That is not a value from this workspace's prior runs, and
 * the field is a coded selection (customizing-defined), so its F4 value help
 * is read rather than guessing a key. Nothing is filled in or executed.
 *
 *   npx playwright test --project=exploratory tests/discover-tpm-valuation-class.spec.ts
 */

const log = makeLogger();

test.afterEach(() => {
  log.flush('discover-tpm-valuation-class-log.txt');
});

for (const tcode of ['TPM44', 'TPM1'] as const) {
  test(`DISCOVERY: ${tcode} Valuation Class value help`, async ({ sapPage }) => {
    test.setTimeout(90_000);

    await openTransaction(sapPage, tcode);
    await assertDevSystem(sapPage, tcode, log.note);

    await openValueHelp(sapPage, 'Valuation Class', 0);
    const help = await readSearchHelp(sapPage);
    log.note(`${tcode} Valuation Class value help: header=${JSON.stringify(help.header)} total=${help.total}`);
    for (const row of help.rows) log.note(`  ${JSON.stringify(row)}`);
    await closeValueHelp(sapPage);

    expect(help.rows.length, `${tcode} Valuation Class value help must return at least one row`).toBeGreaterThan(0);
  });
}
