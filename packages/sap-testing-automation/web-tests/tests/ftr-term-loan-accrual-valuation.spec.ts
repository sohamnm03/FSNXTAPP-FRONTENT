import { test, expect } from '../fixtures';
import { readArtifact, writeArtifact, dumpOnFailure } from '../webgui';
import { loadDataset, selectRows } from '../dataset';
import { makeLogger } from '../modules/session';
import {
  openDealEntry, fillTermLoan, saveDeal, settleDeal, postFlows,
  runAccrualDeferral, runValuation, type TermLoanSpec,
} from '../modules/treasury';

/**
 * TC-009 — Term loan: FTR_CREATE -> FTR_EDIT (settle) -> TBB1 (post) ->
 * TPM44 (accrual/deferral) -> TPM1 (valuation), in WebGUI.
 *
 * Extends TC-002's lifecycle (same treasury business components, one row of
 * ../test-data/term-loan-accrual-valuation.dataset.json) with the two
 * month-end treasury runs that follow a post in practice, both scoped to the
 * one deal by its Financial Transaction number and run once, at the first
 * month-end key date after the term start (not the full 12-month term - see
 * the case file's Known deviations).
 *
 * WRITES TO THE DATABASE (five times), authorised by the requester.
 *
 *   entry       - fill the FTR_CREATE entry screen, stop                (no write)
 *   fill        - also fill the deal screen, stop                       (no write)
 *   save        - also save the deal and capture the deal number        WRITE 1
 *   settle-open - also FTR_EDIT -> Settle, stop on the screen           (no write)
 *   settle      - also save the settlement                             WRITE 2
 *   post        - also TBB1, run directly with Test Run OFF             WRITE 3
 *   tpm44       - also TPM44, run directly with Test Run OFF            WRITE 4
 *   tpm1        - also TPM1, run directly with Test Run OFF             WRITE 5
 *
 * TBB1/TPM44/TPM1 (every screen with a Test Run checkbox) run straight to the
 * live commit - no simulation pass first. The checkbox is still driven to
 * `false` and read back, because it defaults to ON and a run that never
 * clears it would otherwise simulate and write nothing while reporting
 * success. Per the requester's standing instruction (2026-08-18): never run
 * a screen with its Test Run checkbox checked.
 *
 *   $env:FLOW_STAGE="save"
 *   $env:DEAL_NO="300012"                # resume on an existing deal
 */

const STAGES = [
  'entry', 'fill', 'save', 'settle-open', 'settle', 'post', 'tpm44', 'tpm1',
] as const;
type Stage = (typeof STAGES)[number];

const STAGE = (process.env.FLOW_STAGE ?? 'entry') as Stage;
if (!STAGES.includes(STAGE)) {
  throw new Error(`FLOW_STAGE='${STAGE}' is not one of: ${STAGES.join(', ')}`);
}
/** Has the run been asked to go at least this far? */
const upTo = (s: Stage) => STAGES.indexOf(STAGE) >= STAGES.indexOf(s);

const ds = loadDataset('term-loan-accrual-valuation');
const rows = selectRows(ds, process.env.DATASET_ROWS ?? 'baseline');
if (rows.length !== 1) {
  throw new Error(
    `TC-009 drives exactly one row; DATASET_ROWS selected ${rows.length}. ` +
      `Known: ${ds.rows.map((r) => r.id).join(', ')}`,
  );
}
const row = rows[0];
expect(row.keyDate, `dataset row '${row.id}' has no keyDate for TPM44/TPM1`).toBeTruthy();

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
  generalValuationClass: row.generalValuationClass || undefined,
};

const log = makeLogger();
const ctx = { note: log.note, tag: 'tc-009' };

// A green run emits nothing to read; a red one emits everything.
test.afterEach(async ({ sapPage }, testInfo) => {
  log.flush('tc-009-flow-log.txt');
  if (testInfo.status !== testInfo.expectedStatus) {
    await dumpOnFailure(sapPage, `tc-009-${STAGE}`);
  }
});

test(`TC-009 term loan accrual/valuation flow (stage=${STAGE}, row=${row.id})`, async ({ sapPage }) => {
  test.setTimeout(900_000);

  log.note(`dataset row ${row.id}: ${row.label ?? ''}`);
  log.note(`key date for TPM44/TPM1: ${row.keyDate}`);

  /**
   * Resume switch. FTR_CREATE runs unconditionally otherwise, so rerunning a
   * later stage after a mid-flow failure would create a *second* deal and act
   * on the wrong one.
   */
  const resumeDeal = (process.env.DEAL_NO ?? '').trim();
  let dealNo = '';

  if (resumeDeal) {
    expect(resumeDeal, 'DEAL_NO must be a transaction number').toMatch(/^\d{5,12}$/);
    log.note(`DEAL_NO=${resumeDeal} supplied - skipping FTR_CREATE (no deal will be created).`);
    dealNo = resumeDeal;
  } else {
    // ============================================================ FTR_CREATE
    await openDealEntry(sapPage, spec, ctx);

    if (!upTo('fill')) {
      log.note('STAGE=entry - stopping before filling the deal screen. Nothing written.');
      return;
    }

    const filled = await fillTermLoan(sapPage, spec, ctx);
    expect(filled.blocked, `unexpected dialog: ${filled.blocked}`).toBeNull();

    const amount = parseFloat((filled.filled.amount ?? '').replace(/[\s,]/g, ''));
    expect(amount, 'amount must survive the round trip').toBeCloseTo(parseFloat(row.amount), 2);
    expect(filled.filled.termStart).toBe(row.startDate);
    expect(filled.filled.termEnd).toBe(row.endDate);
    expect((filled.filled.currency ?? '').trim().toUpperCase()).toBe(row.currency.toUpperCase());
    expect(parseFloat(filled.filled.nominalRate ?? '')).toBeCloseTo(parseFloat(row.interestRate), 4);

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

    dealNo = saved.dealNo;
    writeArtifact('tc-009-deal-number.txt', dealNo);

    if (!upTo('settle-open')) {
      log.note('STAGE=save - deal created. Stopping before settlement.');
      return;
    }
  }

  // ============================================================== FTR_EDIT
  const dealForNext = dealNo || readArtifact('tc-009-deal-number.txt');
  expect(dealForNext, 'need a deal number to settle').toMatch(/^\d{5,12}$/);

  const settled = await settleDeal(
    sapPage,
    { companyCode: row.companyCode, dealNo: dealForNext },
    ctx,
    { commit: upTo('settle') },
  );
  expect(settled.blocked, `settlement blocked: ${settled.blocked}`).toBeNull();

  if (settled.state === 'already-settled') {
    log.note('WRITE 2 skipped - the settlement being asserted is already true.');
  } else {
    expect(settled.values, 'settlement screen must show the deal number').toContain(dealForNext);
    expect(settled.screenText, 'must be in settlement, not contract, mode').toContain('Contract settlement');

    if (settled.state === 'opened') {
      log.note('STAGE=settle-open - settlement screen open, nothing saved.');
      return;
    }
    expect(settled.status, 'settlement must be confirmed by SAP').toMatch(/is changed|is settled/i);
  }

  if (!upTo('post')) {
    log.note('STAGE=settle - settlement saved. Stopping before TBB1.');
    return;
  }

  // ================================================================== TBB1
  const postArgs = {
    companyCode: row.companyCode,
    dealNo: dealForNext,
    dueDate: row.dueDate,
    postingDate: row.postingDate,
  };

  /**
   * A deal whose flows are already posted selects nothing on a re-run, and
   * TBB1 says so with "No flows exist for processing" under a Success prefix.
   * That is the posting being already true, not a failure - the same shape as
   * an already-settled deal - and it must not be read as a phantom pass
   * either, which is why it is matched explicitly rather than by the absence
   * of the deal number.
   */
  const ALREADY_POSTED = /no flows exist for processing/i;

  // ========================= WRITE 3: post flows =========================
  // Runs straight to the live commit - no Test Run simulation pass first (see
  // the header comment). Test Run is still driven to false and read back.
  const live = await postFlows(sapPage, postArgs, false, ctx);
  expect(live.blocked, `unexpected dialog in TBB1: ${live.blocked}`).toBeNull();
  expect(live.selection.testRun, 'TBB1 must run with Test Run cleared').toBe('false');
  const alreadyPosted = ALREADY_POSTED.test(live.text);

  if (alreadyPosted) {
    log.note('TBB1 reports no flows left to process - this deal is already posted. WRITE 3 already satisfied.');
  } else {
    expect(live.text, 'TBB1 live post must have selected this deal').toContain(dealForNext);
    expect(live.text, 'the live run must not read as a simulation').not.toMatch(/test run was successful/i);
    log.note('--- TBB1 post complete ---');
  }

  if (!upTo('tpm44')) {
    log.note('STAGE=post - TBB1 posted. Stopping before TPM44.');
    return;
  }

  // ================================================================= TPM44
  const tpmArgs = {
    companyCode: row.companyCode,
    dealNo: dealForNext,
    keyDate: row.keyDate!,
    valuationArea: row.valuationArea,
    valuationClass: row.valuationClass,
    valuationCategory: row.valuationCategory,
  };

  /**
   * An accrual already posted for this key date selects nothing on a re-run and
   * TPM44 reports an empty protocol. Like TBB1's "no flows exist", that is the
   * accrual being already true rather than a failure - and, like it, it is
   * matched explicitly so it can never be confused with a run that produced
   * nothing because it was misconfigured.
   */
  const NOTHING_TO_ACCRUE = /list does not contain any data/i;

  // ==================== WRITE 4: TPM44 accrual/deferral ====================
  // Runs straight to the live commit - no Test Run simulation pass first (see
  // the header comment). Test Run is still driven to false and read back.
  const tpm44Live = await runAccrualDeferral(sapPage, tpmArgs, false, ctx);
  expect(tpm44Live.refusedToRun, `TPM44 run never executed - its selection screen refused it: ${tpm44Live.refusedToRun}`).toBeNull();
  expect(tpm44Live.blocked, `unexpected dialog in TPM44: ${tpm44Live.blocked}`).toBeNull();
  expect(tpm44Live.selection.testRun, 'TPM44 must run with Test Run cleared').toBe('false');
  expect(tpm44Live.selection.transaction, 'TPM44 must be scoped to this deal').toBe(dealForNext);
  expect(tpm44Live.selection.keyDate, 'TPM44 must run at the requested key date').toBe(row.keyDate);

  const alreadyAccrued = NOTHING_TO_ACCRUE.test(tpm44Live.text);
  if (alreadyAccrued) {
    log.note('TPM44 protocol is empty - this key date is already accrued. WRITE 4 already satisfied.');
  } else {
    // TPM44's protocol has no transaction-number column - it reports by company
    // code / product type / key date - so the deal scoping is asserted on the
    // selection field that was actually sent, and the protocol is checked for
    // having produced accrual rows at the requested key date rather than being
    // searched for a number it never prints.
    expect(tpm44Live.text, 'TPM44 run must have produced a protocol for the key date').toContain(row.keyDate!);
    log.note('--- TPM44 run complete ---');
  }

  if (!upTo('tpm1')) {
    log.note('STAGE=tpm44 - TPM44 run. Stopping before TPM1.');
    return;
  }

  // ========================= WRITE 5: TPM1 valuation =========================
  // Runs straight to the live commit - no Test Run simulation pass first (see
  // the header comment). Test Run is still driven to false and read back.
  const tpm1Live = await runValuation(sapPage, tpmArgs, false, ctx);
  expect(tpm1Live.refusedToRun, `TPM1 run never executed - its selection screen refused it: ${tpm1Live.refusedToRun}`).toBeNull();
  expect(tpm1Live.blocked, `unexpected dialog in TPM1: ${tpm1Live.blocked}`).toBeNull();
  expect(tpm1Live.selection.testRun, 'TPM1 must run with Test Run cleared').toBe('false');
  expect(tpm1Live.selection.transaction, 'TPM1 must be scoped to this deal').toBe(dealForNext);
  expect(tpm1Live.selection.keyDate, 'TPM1 must run at the requested key date').toBe(row.keyDate);
  // The positions list is what F8 alone produces, and it writes nothing. A
  // live run that ends there has valued nothing however healthy it looks.
  expect(
    tpm1Live.text,
    'the TPM1 live run must have moved past the position selection into an actual valuation',
  ).not.toMatch(/Display Selected Treasury Positions for Valuation/i);
  log.note('--- flow complete ---');
});
