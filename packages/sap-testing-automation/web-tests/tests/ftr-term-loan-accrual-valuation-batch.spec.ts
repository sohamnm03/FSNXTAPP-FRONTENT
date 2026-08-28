import { test, expect } from '../fixtures';
import { writeArtifact, readArtifact, dumpOnFailure, acquireBatchLock, releaseBatchLock } from '../webgui';
import { loadDataset, selectRows, type DatasetRow } from '../dataset';
import { makeLogger } from '../modules/session';
import {
  openDealEntry, fillTermLoan, saveDeal, settleDeal, postFlows,
  runAccrualDeferral, runValuation, type TermLoanSpec,
} from '../modules/treasury';

/**
 * TC-012 — term loan batch, extended: every row of the
 * `term-loan-accrual-valuation-batch` dataset taken through the full
 * FTR_CREATE -> FTR_EDIT (settle) -> TBB1 (post) -> TPM44 (accrual/deferral)
 * -> TPM1 (valuation) lifecycle, in WebGUI.
 *
 * TC-008 is to TC-002 what this is to TC-009: the same treasury business
 * components, driven once per row of
 * ../test-data/term-loan-accrual-valuation-batch.dataset.json instead of
 * once for a single deal. A screen change is fixed once, in
 * web-tests/screens/ and modules/treasury.ts, and every case that touches
 * these screens picks it up.
 *
 * Every screen with a Test Run checkbox (TBB1, TPM44, TPM1) runs straight to
 * the live commit - no simulation pass first, per the requester's standing
 * instruction (2026-08-18): never run a screen with its Test Run checkbox
 * checked. The checkbox is still driven to `false` and read back before each
 * run, since it defaults to ON.
 *
 * WRITES: 5 per row, all authorised in advance (see the dataset's `authorised`).
 *
 * Resumable per row: each row's outcome is written to its own artifact as soon as
 * it finishes, and a row already recorded as VALUED is skipped on a re-run.
 * Re-running a completed step is not idempotent - a deal can only be settled
 * once - so this is what keeps a mid-batch failure from re-writing what worked.
 *
 *   $env:DATASET_ROWS="03,07"    # drive only those rows
 *   $env:FLOW_STAGE="save"       # stop after creating each deal
 *   $env:FLOW_STAGE="settle"     # also settle, stop before TBB1
 *   $env:FLOW_STAGE="post"       # also post, stop before TPM44
 *   $env:FLOW_STAGE="tpm44"      # also accrue, stop before TPM1
 */

const STAGES = ['save', 'settle', 'post', 'tpm44', 'tpm1'] as const;
type Stage = (typeof STAGES)[number];
const STAGE = (process.env.FLOW_STAGE ?? 'tpm1') as Stage;
if (!STAGES.includes(STAGE)) {
  throw new Error(`FLOW_STAGE='${STAGE}' is not one of: ${STAGES.join(', ')}`);
}
/** Has the run been asked to go at least this far? */
const upTo = (s: Stage) => STAGES.indexOf(STAGE) >= STAGES.indexOf(s);

const ds = loadDataset('term-loan-accrual-valuation-batch');
const rows = selectRows(ds);

type Verdict = 'PENDING' | 'CREATED' | 'SETTLED' | 'POSTED' | 'ACCRUED' | 'VALUED' | 'REFUSED' | 'ERROR';

type Outcome = {
  id: string;
  verdict: Verdict;
  dealNo: string;
  amount: string;
  startDate: string;
  endDate: string;
  keyDate: string;
  message: string;
  startedAt: string;
  finishedAt: string;
};

const results: Outcome[] = [];

// Refuses to start if another live process is already running this batch -
// see acquireBatchLock's own comment (webgui.ts) for why: this batch's
// resume artifacts only write in afterAll, so two concurrent processes have
// no way to see each other's progress and will duplicate live writes to SAP.
// This happened for real on 2026-08-18 (4 extra deals, see
// results/TC-012-2026-08-18-1928.md) after a shell timeout that did not
// actually stop the process it reported as killed.
test.beforeAll(() => {
  acquireBatchLock(ds.id);
});
test.afterAll(() => {
  releaseBatchLock(ds.id);
});

function specFor(row: DatasetRow): TermLoanSpec {
  return {
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
    interestFrequency: row.interestFrequency,
    generalValuationClass: row.generalValuationClass,
  };
}

test.afterAll(() => {
  for (const r of results) writeArtifact(`tc-012-deal-${r.id}.json`, JSON.stringify(r, null, 2));

  // Merge this run's outcomes over any recorded earlier, so a resumed batch
  // reports the whole batch rather than only the rows it happened to re-run.
  const merged = new Map<string, Outcome>();
  for (const row of ds.rows) {
    const prior = readArtifact(`tc-012-deal-${row.id}.json`);
    if (prior) {
      try { merged.set(row.id, JSON.parse(prior) as Outcome); } catch { /* this run's own result wins below */ }
    }
  }
  for (const r of results) merged.set(r.id, r);
  const all = ds.rows.map((r) => merged.get(r.id)).filter(Boolean) as Outcome[];

  const lines: string[] = [
    '# TC-012 term loan accrual/valuation batch - results',
    '',
    `Dataset: ${ds.id} (${ds.rows.length} rows, ${ds.writesPerRow} writes per row)`,
    '',
    '| # | Amount | Start | Key Date | Verdict | Deal No | Message |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of all) {
    lines.push(
      `| ${r.id} | ${r.amount} | ${r.startDate} | ${r.keyDate} | ${r.verdict} | ${r.dealNo || '-'} | ${r.message.replace(/\|/g, '/').slice(0, 140)} |`,
    );
  }
  writeArtifact('tc-012-batch-summary.md', lines.join('\n'));

  console.log('\n===== TC-012 BATCH SUMMARY =====');
  for (const r of all) {
    console.log(
      `${r.id} ${r.verdict.padEnd(8)} deal=${(r.dealNo || '-').padEnd(8)} ${r.amount} ${r.startDate} key=${r.keyDate} :: ${r.message.slice(0, 100)}`,
    );
  }
});

for (const row of rows) {
  test(`TC-012 deal ${row.id} (${row.amount} ${row.currency}, ${row.startDate})`, async ({ sapPage }) => {
    test.setTimeout(600_000);

    const log = makeLogger(row.id);
    const ctx = { note: log.note, tag: `tc-012-${row.id}` };
    const spec = specFor(row);

    const out: Outcome = {
      id: row.id, verdict: 'PENDING', dealNo: '', amount: row.amount,
      startDate: row.startDate, endDate: row.endDate, keyDate: row.keyDate ?? '',
      message: '', startedAt: new Date().toISOString(), finishedAt: '',
    };

    // Idempotent resume: pick up each row from wherever a prior run left it,
    // rather than re-running a step that already committed.
    let dealNo = '';
    let resumeFrom: 'create' | 'settle' | 'post' | 'tpm44' | 'tpm1' = 'create';
    const prior = readArtifact(`tc-012-deal-${row.id}.json`);
    if (prior) {
      try {
        const p = JSON.parse(prior) as Outcome;
        if (p.verdict === 'VALUED') {
          log.note(`already VALUED as deal ${p.dealNo} - skipping (idempotent resume)`);
          results.push(p);
          return;
        }
        if (['CREATED', 'SETTLED', 'POSTED', 'ACCRUED'].includes(p.verdict)) {
          dealNo = p.dealNo;
          out.dealNo = dealNo;
          out.verdict = p.verdict;
          resumeFrom =
            p.verdict === 'ACCRUED' ? 'tpm1' :
            p.verdict === 'POSTED' ? 'tpm44' :
            p.verdict === 'SETTLED' ? 'post' : 'settle';
          log.note(`resuming deal ${dealNo} from recorded verdict ${p.verdict}`);
        }
      } catch { /* unreadable prior artifact - proceed as if none */ }
    }

    try {
      if (resumeFrom === 'create') {
        // ============================================================ FTR_CREATE
        await openDealEntry(sapPage, spec, ctx);

        const filled = await fillTermLoan(sapPage, spec, ctx);
        if (filled.blocked) {
          out.verdict = 'REFUSED';
          out.message = `dialog before save: ${filled.blocked}`;
          return;
        }
        if (filled.refused) {
          out.verdict = 'REFUSED';
          out.message = filled.refused;
          return;
        }

        const amountRead = parseFloat((filled.filled.amount ?? '').replace(/[\s,]/g, ''));
        expect(amountRead, 'amount must survive the round trip').toBeCloseTo(parseFloat(row.amount), 2);
        expect(filled.filled.termStart).toBe(row.startDate);
        expect(filled.filled.termEnd).toBe(row.endDate);
        expect((filled.filled.currency ?? '').trim().toUpperCase()).toBe(row.currency.toUpperCase());
        expect(parseFloat(filled.filled.nominalRate ?? '')).toBeCloseTo(parseFloat(row.interestRate), 4);

        // ======================= WRITE 1: save the deal =======================
        const saved = await saveDeal(sapPage, ctx);
        if (saved.blocked) {
          out.verdict = 'REFUSED';
          out.message = `dialog during save: ${saved.blocked}`;
          return;
        }
        if (saved.refused) {
          out.verdict = 'REFUSED';
          out.message = saved.refused;
          return;
        }

        expect(saved.dealNo, 'a deal number must be captured from the save confirmation').toMatch(/^\d{5,12}$/);
        dealNo = saved.dealNo;
        out.dealNo = dealNo;
        out.verdict = 'CREATED';

        if (!upTo('settle')) {
          out.message = `created ${dealNo} - stopped before settlement (FLOW_STAGE=save)`;
          log.note(`STAGE=save - deal ${dealNo} created. Stopping before settlement.`);
          return;
        }
      }

      if (resumeFrom === 'create' || resumeFrom === 'settle') {
        // ==================== WRITE 2: settle the deal ====================
        const settled = await settleDeal(sapPage, { companyCode: row.companyCode, dealNo }, ctx);
        if (settled.state === 'blocked') {
          out.message = settled.blocked ?? 'settlement blocked';
          return;
        }
        if (settled.state !== 'already-settled') {
          expect(settled.values, 'settlement screen must show the deal number').toContain(dealNo);
          expect(settled.screenText, 'must be in settlement, not contract, mode').toContain('Contract settlement');
          expect(settled.status, 'settlement must be confirmed by SAP').toMatch(/is changed|is settled/i);
        }
        out.verdict = 'SETTLED';

        if (!upTo('post')) {
          out.message = `created ${dealNo}, settled - stopped before post (FLOW_STAGE=settle)`;
          log.note(`STAGE=settle - deal ${dealNo} settled. Stopping before TBB1.`);
          return;
        }
      }

      if (resumeFrom !== 'tpm44' && resumeFrom !== 'tpm1') {
        // ========================= WRITE 3: post flows =========================
        // Runs straight to the live commit - no Test Run simulation pass first.
        const postArgs = {
          companyCode: row.companyCode, dealNo, dueDate: row.dueDate, postingDate: row.postingDate,
        };
        const live = await postFlows(sapPage, postArgs, false, ctx);
        if (live.blocked) {
          out.message = `dialog in TBB1 live post: ${live.blocked}`;
          return;
        }
        expect(live.selection.testRun, 'the live post must have cleared Test Run').toBe('false');
        expect(live.selection.dueDateCutoff, 'TBB1 due-date cutoff must match the requested date').toBe(row.dueDate);
        expect(live.selection.postingDate, 'TBB1 posting date must match the requested date').toBe(row.postingDate);
        // A deal whose flow is not yet due selects nothing; that is recorded, not
        // failed, the same way TC-004's Money Market discovery run treated it.
        if (!live.text.includes(dealNo) && !/no flows exist for processing/i.test(live.text)) {
          log.note(`WARNING: TBB1 did not select deal ${dealNo} - nothing due by ${row.dueDate}.`);
        }
        out.verdict = 'POSTED';

        if (!upTo('tpm44')) {
          out.message = `created ${dealNo}, settled, posted - stopped before TPM44 (FLOW_STAGE=post)`;
          log.note(`STAGE=post - deal ${dealNo} posted. Stopping before TPM44.`);
          return;
        }
      }

      const tpmArgs = {
        companyCode: row.companyCode,
        dealNo,
        keyDate: row.keyDate!,
        valuationArea: row.valuationArea,
        valuationClass: row.valuationClass,
        valuationCategory: row.valuationCategory,
      };

      if (resumeFrom !== 'tpm1') {
        // ==================== WRITE 4: TPM44 accrual/deferral ====================
        // Runs straight to the live commit - no Test Run simulation pass first.
        const tpm44 = await runAccrualDeferral(sapPage, tpmArgs, false, ctx);
        if (tpm44.blocked) {
          out.message = `dialog in TPM44: ${tpm44.blocked}`;
          return;
        }
        if (tpm44.refusedToRun) {
          out.verdict = 'REFUSED';
          out.message = `TPM44 refused to run: ${tpm44.refusedToRun}`;
          return;
        }
        expect(tpm44.selection.testRun, 'the TPM44 live run must have cleared Test Run').toBe('false');
        expect(tpm44.selection.transaction, 'TPM44 must be scoped to this deal').toBe(dealNo);
        expect(tpm44.selection.keyDate, 'TPM44 must run at the requested key date').toBe(row.keyDate);
        out.verdict = 'ACCRUED';

        if (!upTo('tpm1')) {
          out.message = `created ${dealNo}, settled, posted, accrued - stopped before TPM1 (FLOW_STAGE=tpm44)`;
          log.note(`STAGE=tpm44 - deal ${dealNo} accrued. Stopping before TPM1.`);
          return;
        }
      }

      // ========================= WRITE 5: TPM1 valuation =========================
      // Runs straight to the live commit - no Test Run simulation pass first.
      const tpm1 = await runValuation(sapPage, tpmArgs, false, ctx);
      if (tpm1.blocked) {
        out.message = `dialog in TPM1: ${tpm1.blocked}`;
        return;
      }
      if (tpm1.refusedToRun) {
        out.verdict = 'REFUSED';
        out.message = `TPM1 refused to run: ${tpm1.refusedToRun}`;
        return;
      }
      expect(tpm1.selection.testRun, 'the TPM1 live run must have cleared Test Run').toBe('false');
      expect(tpm1.selection.transaction, 'TPM1 must be scoped to this deal').toBe(dealNo);
      expect(tpm1.selection.keyDate, 'TPM1 must run at the requested key date').toBe(row.keyDate);
      expect(
        tpm1.text,
        'the TPM1 live run must have moved past the position selection into an actual valuation',
      ).not.toMatch(/Display Selected Treasury Positions for Valuation/i);

      out.verdict = 'VALUED';
      out.message = `created ${dealNo}, settled, posted, accrued, valued`;
    } catch (e) {
      out.verdict = out.verdict === 'PENDING' ? 'ERROR' : out.verdict;
      out.message = (e as Error).message.split('\n')[0].slice(0, 300);
      await dumpOnFailure(sapPage, `tc-012-${row.id}`);
    } finally {
      out.finishedAt = new Date().toISOString();
      log.flush(`tc-012-deal-${row.id}-log.txt`);
      results.push(out);
      log.note(`RESULT: ${out.verdict} deal=${out.dealNo || '-'} :: ${out.message}`);
    }
  });
}
