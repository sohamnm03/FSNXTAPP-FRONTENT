import { test, expect } from '../fixtures';
import { writeArtifact, dumpOnFailure } from '../webgui';
import { loadDataset, selectRows } from '../dataset';
import { makeLogger } from '../modules/session';
import { openDealEntry, fillTermLoan, saveDeal, type TermLoanSpec } from '../modules/treasury';

/**
 * TC-013 — Term loan with variable interest: FTR_CREATE only, WebGUI.
 *
 * Company code 1000 / product 22A / txn type 100 / partner 700000453 - the
 * same profile TC-009/TC-012 use for fixed-rate loans, driven here with a
 * variable rate instead. Create only: settlement and posting behave
 * identically for any interest structure and are already proven by TC-002,
 * so repeating them here would add a commit and no information (same
 * scoping reasoning TC-003 uses for its variant matrix).
 *
 * Interest Category = Variable and Reference Interest Rate = RBI_REPO were
 * both found by live discovery, not guessed:
 *  - discover-ftr-1000-22a-variable-rate.spec.ts read the field's own F4
 *    search help (16 codes valid for company code 1000) before any value
 *    was chosen — TC-003's V10 variant hit the same "Enter a reference
 *    interest rate" refusal on the 9800/10B profile and left it
 *    unresolved, since picking a code is a data decision;
 *  - the same discovery run, extended, found a non-blocking check-run
 *    warning ("No interest calculation method entered for reference
 *    interest rate") right after Reference Interest Rate is set, while
 *    Interest Calculation Method already shows a value (act/365). This spec
 *    does not touch that field — whether the warning actually blocks the
 *    save is exactly what running it live finds out. That is safe to leave
 *    to the live run: handleSaveDialogs() in ../webgui.ts already refuses
 *    to confirm any check run reporting errors, so a genuine blocker fails
 *    this test cleanly with no write, rather than a guessed workaround
 *    papering over it.
 *
 * WRITES TO THE DATABASE (once), authorised by the requester.
 *
 *   entry   - fill the FTR_CREATE entry screen, stop              (no write)
 *   fill    - also fill the deal screen, stop                     (no write)
 *   save    - also save the deal and capture the deal number      WRITE 1
 *
 *   $env:FLOW_STAGE="save"
 */

const STAGES = ['entry', 'fill', 'save'] as const;
type Stage = (typeof STAGES)[number];

const STAGE = (process.env.FLOW_STAGE ?? 'entry') as Stage;
if (!STAGES.includes(STAGE)) {
  throw new Error(`FLOW_STAGE='${STAGE}' is not one of: ${STAGES.join(', ')}`);
}
const upTo = (s: Stage) => STAGES.indexOf(STAGE) >= STAGES.indexOf(s);

const ds = loadDataset('term-loan-variable-rate');
const rows = selectRows(ds, process.env.DATASET_ROWS ?? 'baseline');
if (rows.length !== 1) {
  throw new Error(
    `TC-013 drives exactly one row; DATASET_ROWS selected ${rows.length}. ` +
      `Known: ${ds.rows.map((r) => r.id).join(', ')}`,
  );
}
const row = rows[0];

const spec: TermLoanSpec = {
  companyCode: row.companyCode,
  productType: row.productType,
  transactionType: row.transactionType,
  partner: row.partner,
  amount: row.amount,
  currency: row.currency,
  interestRate: row.interestRate,
  startDate: row.startDate,
  endDate: row.endDate,
  contractDate: row.contractDate,
  interestFrequency: row.interestFrequency || undefined,
  interestCategory: row.interestCategory,
  referenceInterestRate: row.referenceInterestRate,
  generalValuationClass: row.generalValuationClass,
};

const log = makeLogger();
const ctx = { note: log.note, tag: 'tc-013', variant: row.id };

// A green run emits nothing to read; a red one emits everything.
test.afterEach(async ({ sapPage }, testInfo) => {
  log.flush('tc-013-flow-log.txt');
  if (testInfo.status !== testInfo.expectedStatus) {
    await dumpOnFailure(sapPage, `tc-013-${STAGE}`);
  }
});

test(`TC-013 term loan variable-rate flow (stage=${STAGE}, row=${row.id})`, async ({ sapPage }) => {
  test.setTimeout(300_000);

  log.note(`dataset row ${row.id}: ${row.label ?? ''}`);
  log.note(`interest category: ${spec.interestCategory}, reference rate: ${spec.referenceInterestRate}`);

  // ============================================================ FTR_CREATE
  await openDealEntry(sapPage, spec, ctx);

  if (!upTo('fill')) {
    log.note('STAGE=entry - stopping before filling the deal screen. Nothing written.');
    return;
  }

  const filled = await fillTermLoan(sapPage, spec, ctx);
  expect(filled.blocked, `unexpected dialog: ${filled.blocked}`).toBeNull();

  // SAP reformats the amount on Enter (100000 -> "100,000.00"), so it is
  // compared numerically rather than against what was typed.
  const amount = parseFloat((filled.filled.amount ?? '').replace(/[\s,]/g, ''));
  expect(amount, 'amount must survive the round trip').toBeCloseTo(parseFloat(row.amount), 2);
  expect(filled.filled.termStart).toBe(row.startDate);
  expect(filled.filled.termEnd).toBe(row.endDate);
  expect((filled.filled.currency ?? '').trim().toUpperCase()).toBe(row.currency.toUpperCase());

  // Variable interest has no nominalRate field at all - the reference rate
  // is what must survive the round trip instead.
  expect(
    (filled.filled.interestCategory ?? '').trim().toLowerCase(),
    'interest category must read back as Variable',
  ).toBe('variable');
  expect(
    (filled.filled.referenceInterestRate ?? '').trim().toUpperCase(),
    'reference interest rate must survive the round trip',
  ).toBe((row.referenceInterestRate ?? '').toUpperCase());

  if (row.interestFrequency) {
    expect(filled.frequency, 'a frequency was requested, so it must have been read back').not.toBeNull();
    expect(filled.frequency!.indicator.trim().toLowerCase()).toBe(row.interestFrequency.toLowerCase());
    expect(filled.frequency!.count, 'periodic frequency must expose a count').not.toBeNull();
    expect(filled.frequency!.unit, 'periodic frequency must expose a unit').not.toBeNull();
  }

  expect(filled.refused, `SAP refused before the save: ${filled.refused}`).toBeNull();

  if (!upTo('save')) {
    log.note('STAGE=fill - stopping before Save. Nothing written.');
    return;
  }

  // ======================= WRITE 1: save the deal =======================
  const saved = await saveDeal(sapPage, ctx);
  expect(saved.blocked, `unexpected dialog during save: ${saved.blocked}`).toBeNull();
  expect(saved.refused, `SAP refused the save: ${saved.refused}`).toBeNull();
  expect(saved.dealNo, 'a deal number must be captured from the save confirmation').toMatch(/^\d{5,12}$/);

  writeArtifact('tc-013-deal-number.txt', saved.dealNo);
  log.note(`--- deal ${saved.dealNo} created ---`);
});
