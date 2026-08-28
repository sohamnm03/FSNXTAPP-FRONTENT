import { test, expect } from '../fixtures';
import { readArtifact, writeArtifact, dumpOnFailure } from '../webgui';
import { loadDataset, selectRows } from '../dataset';
import { makeLogger } from '../modules/session';
import {
  openDealEntry, fillTermLoan, saveDeal, settleDeal, postFlows, type TermLoanSpec,
} from '../modules/treasury';

/**
 * TC-002 — Term loan: FTR_CREATE -> FTR_EDIT (settle) -> TBB1 (post), in WebGUI.
 *
 * The lifecycle reference case. It drives the same treasury business components
 * as TC-008, over one row of ../test-data/term-loan-single.dataset.json, and adds
 * the thing a batch cannot have: a stage gate in front of every write, so each
 * new screen is seen before anything commits on it.
 *
 * WRITES TO THE DATABASE (three times), authorised by the requester.
 *
 *   entry       - fill the FTR_CREATE entry screen, stop                (no write)
 *   fill        - also fill the deal screen, stop                       (no write)
 *   save        - also save the deal and capture the deal number        WRITE 1
 *   settle-open - also FTR_EDIT -> Settle, stop on the screen           (no write)
 *   settle      - also save the settlement                             WRITE 2
 *   post        - also TBB1, run directly with Test Run OFF             WRITE 3
 *
 * TBB1 (and every other screen with a Test Run checkbox) runs straight to the
 * live commit — no simulation pass first. The checkbox is still driven to
 * `false` and read back, because it defaults to ON and a post that never
 * clears it would otherwise simulate and write nothing while reporting
 * success. Per the requester's standing instruction (2026-08-18): never run
 * a screen with its Test Run checkbox checked.
 *
 *   $env:FLOW_STAGE="save"
 *   $env:DATASET_ROWS="monthly"          # the month-end interest variant
 *   $env:DEAL_NO="200128"                # resume on an existing deal
 */

const STAGES = ['entry', 'fill', 'save', 'settle-open', 'settle', 'post'] as const;
type Stage = (typeof STAGES)[number];

const STAGE = (process.env.FLOW_STAGE ?? 'entry') as Stage;
if (!STAGES.includes(STAGE)) {
  throw new Error(`FLOW_STAGE='${STAGE}' is not one of: ${STAGES.join(', ')}`);
}
/** Has the run been asked to go at least this far? */
const upTo = (s: Stage) => STAGES.indexOf(STAGE) >= STAGES.indexOf(s);

const ds = loadDataset('term-loan-single');
const rows = selectRows(ds, process.env.DATASET_ROWS ?? 'baseline');
if (rows.length !== 1) {
  throw new Error(
    `TC-002 drives exactly one row; DATASET_ROWS selected ${rows.length}. ` +
      `Known: ${ds.rows.map((r) => r.id).join(', ')}`,
  );
}
const row = rows[0];

/**
 * Frequency override, kept because the case file documents it. The dataset row is
 * the normal way to choose a schedule (`DATASET_ROWS="monthly"`).
 */
const interestFrequency = (process.env.INTEREST_FREQUENCY ?? row.interestFrequency ?? '').trim();

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
  interestFrequency: interestFrequency || undefined,
};

const log = makeLogger();
// `variant` keeps the pre-save screenshot of one interest schedule from being
// overwritten by a run of another - it is the only view that shows the schedule.
const ctx = { note: log.note, tag: 'tc-002', variant: interestFrequency || 'default' };

// A green run emits nothing to read; a red one emits everything.
test.afterEach(async ({ sapPage }, testInfo) => {
  log.flush('tc-002-flow-log.txt');
  if (testInfo.status !== testInfo.expectedStatus) {
    await dumpOnFailure(sapPage, `tc-002-${STAGE}`);
  }
});

test(`TC-002 term loan flow (stage=${STAGE}, row=${row.id})`, async ({ sapPage }) => {
  test.setTimeout(900_000);

  log.note(`dataset row ${row.id}: ${row.label ?? ''}`);
  log.note(`interest frequency: ${interestFrequency || 'SAP default (At End of Term)'}`);

  /**
   * Resume switch. FTR_CREATE runs unconditionally otherwise, so rerunning the
   * settle or post stage after a mid-flow failure would create a *second* deal
   * and settle the wrong one.
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

    // SAP reformats on Enter (100000 -> "100,000.00", 10 -> "10.0000000"), so the
    // amount and rate are compared numerically rather than against what we typed.
    const amount = parseFloat((filled.filled.amount ?? '').replace(/[\s,]/g, ''));
    expect(amount, 'amount must survive the round trip').toBeCloseTo(parseFloat(row.amount), 2);
    expect(filled.filled.termStart).toBe(row.startDate);
    expect(filled.filled.termEnd).toBe(row.endDate);
    expect((filled.filled.currency ?? '').trim().toUpperCase()).toBe(row.currency.toUpperCase());
    expect(parseFloat(filled.filled.nominalRate ?? '')).toBeCloseTo(parseFloat(row.interestRate), 4);

    // The interest schedule survived the round trip. Checked after Enter, not
    // just after the click: selecting the entry and having SAP keep it are two
    // different things, and a deal saved on the default rhythm would look
    // identical everywhere else on this screen.
    if (interestFrequency) {
      expect(filled.frequency, 'a frequency was requested, so it must have been read back').not.toBeNull();
      expect(filled.frequency!.indicator.trim().toLowerCase()).toBe(interestFrequency.toLowerCase());
      // A periodic rhythm must expose a count and unit; their absence means SAP
      // fell back to a one-off schedule whatever the dropdown displays.
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

    dealNo = saved.dealNo;
    writeArtifact('tc-002-deal-number.txt', dealNo);

    if (!upTo('settle-open')) {
      log.note('STAGE=save - deal created. Stopping before settlement.');
      return;
    }
  }

  // ============================================================== FTR_EDIT
  // Prefer the number this run just created; fall back to the recorded one so
  // settle/post can be rerun on their own without recreating the deal.
  const dealForNext = dealNo || readArtifact('tc-002-deal-number.txt');
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
    // Prove we are on the deal we asked for, and in settlement mode - not still
    // sitting on the entry screen because the button click was swallowed. The
    // number is a field *value*, so it is checked against the input values;
    // body text carries the labels only and would never contain it.
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

  // ========================= WRITE 3: post flows =========================
  // Runs straight to the live commit - no Test Run simulation pass first (see
  // the header comment). Test Run is still driven to false and read back.
  const live = await postFlows(sapPage, postArgs, false, ctx);
  expect(live.blocked, `unexpected dialog in TBB1: ${live.blocked}`).toBeNull();
  expect(live.selection.testRun, 'the live post must have cleared Test Run').toBe('false');
  expect(live.selection.dueDateCutoff, 'TBB1 due-date cutoff must match the requested date').toBe(row.dueDate);
  expect(live.selection.postingDate, 'TBB1 posting date must match the requested date').toBe(row.postingDate);
  expect(live.text, 'the live post must have selected this deal').toContain(dealForNext);
  // "(test run)" in the log would mean the Test Run flag never actually cleared
  // and nothing was posted, however healthy the run looked.
  expect(live.text, 'the live run must not still be a simulation').not.toMatch(
    /test run was successful/i,
  );
  log.note('--- flow complete ---');
});
