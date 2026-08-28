import { test, expect } from '../fixtures';
import {
  writeArtifact, readArtifact, captureEvidence, dumpOnFailure, acquireBatchLock, releaseBatchLock,
} from '../webgui';
import { loadDataset, selectRows, type DatasetRow } from '../dataset';
import { makeLogger } from '../modules/session';
import {
  openDealEntry, fillTermLoan, saveDeal, settleDeal, postFlows, type TermLoanSpec,
} from '../modules/treasury';

/**
 * TC-008 — term loan batch: every row of the `term-loan-batch` dataset taken
 * through the full FTR_CREATE -> FTR_EDIT (settle) -> TBB1 (post) lifecycle.
 *
 * The steps are the shared treasury business components, the same ones TC-002
 * drives — so a screen change is fixed once, in web-tests/screens/, and both
 * cases pick it up. The data is ../test-data/term-loan-batch.dataset.json.
 * Adding an eleventh loan is a data edit; nothing here changes.
 *
 * WRITES: 3 per row, all authorised in advance (see the dataset's `authorised`).
 *
 * Resumable per row: each row's outcome is written to its own artifact as soon as
 * it finishes, and a row already recorded as POSTED is skipped on a re-run.
 * Re-running a completed step is not idempotent — a deal can only be settled
 * once — so this is what keeps a mid-batch failure from re-writing what worked.
 *
 *   $env:DATASET_ROWS="03,07"    # drive only those rows
 *   $env:FLOW_STAGE="save"       # stop after creating each deal - no settle, no post
 *   $env:FLOW_STAGE="settle"     # also settle, stop before TBB1
 */

const STAGES = ['save', 'settle', 'post'] as const;
type Stage = (typeof STAGES)[number];
const STAGE = (process.env.FLOW_STAGE ?? 'post') as Stage;
if (!STAGES.includes(STAGE)) {
  throw new Error(`FLOW_STAGE='${STAGE}' is not one of: ${STAGES.join(', ')}`);
}
/** Has the run been asked to go at least this far? */
const upTo = (s: Stage) => STAGES.indexOf(STAGE) >= STAGES.indexOf(s);

const ds = loadDataset('term-loan-batch');
const rows = selectRows(ds);

type Verdict = 'PENDING' | 'CREATED' | 'SETTLED' | 'POSTED' | 'REFUSED' | 'ERROR';

type Outcome = {
  id: string;
  verdict: Verdict;
  dealNo: string;
  amount: string;
  startDate: string;
  endDate: string;
  message: string;
  startedAt: string;
  finishedAt: string;
};

const results: Outcome[] = [];

// Refuses to start if another live process is already running this batch -
// see acquireBatchLock's own comment (webgui.ts) for why: this batch's
// resume artifacts only write in afterAll, so two concurrent processes have
// no way to see each other's progress and will duplicate live writes to SAP.
// A sibling batch spec (TC-012) hit exactly this on 2026-08-18 (4 extra
// deals, see results/TC-012-2026-08-18-1928.md) after a shell timeout that
// did not actually stop the process it reported as killed.
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
  };
}

test.afterAll(() => {
  for (const r of results) writeArtifact(`tc-008-deal-${r.id}.json`, JSON.stringify(r, null, 2));

  // Merge this run's outcomes over any recorded earlier, so a resumed batch
  // reports the whole batch rather than only the rows it happened to re-run.
  const merged = new Map<string, Outcome>();
  for (const row of ds.rows) {
    const prior = readArtifact(`tc-008-deal-${row.id}.json`);
    if (prior) {
      try { merged.set(row.id, JSON.parse(prior) as Outcome); } catch { /* this run's own result wins below */ }
    }
  }
  for (const r of results) merged.set(r.id, r);
  const all = ds.rows.map((r) => merged.get(r.id)).filter(Boolean) as Outcome[];

  const lines: string[] = [
    '# TC-008 term loan batch — results',
    '',
    `Dataset: ${ds.id} (${ds.rows.length} rows, ${ds.writesPerRow} writes per row)`,
    '',
    '| # | Amount | Start | End | Verdict | Deal No | Message |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of all) {
    lines.push(
      `| ${r.id} | ${r.amount} | ${r.startDate} | ${r.endDate} | ${r.verdict} | ${r.dealNo || '-'} | ${r.message.replace(/\|/g, '/').slice(0, 140)} |`,
    );
  }
  writeArtifact('tc-008-batch-summary.md', lines.join('\n'));

  console.log('\n===== TC-008 BATCH SUMMARY =====');
  for (const r of all) {
    console.log(
      `${r.id} ${r.verdict.padEnd(8)} deal=${(r.dealNo || '-').padEnd(8)} ${r.amount} ${r.startDate}-${r.endDate} :: ${r.message.slice(0, 100)}`,
    );
  }
});

for (const row of rows) {
  test(`TC-008 deal ${row.id} (${row.amount} ${row.currency}, ${row.startDate})`, async ({ sapPage }) => {
    test.setTimeout(300_000);

    const log = makeLogger(row.id);
    const ctx = { note: log.note, tag: `tc-008-${row.id}` };
    const spec = specFor(row);

    const out: Outcome = {
      id: row.id, verdict: 'PENDING', dealNo: '', amount: row.amount,
      startDate: row.startDate, endDate: row.endDate, message: '',
      startedAt: new Date().toISOString(), finishedAt: '',
    };

    // Idempotent resume: pick up each row from wherever a prior run left it,
    // rather than re-running a step that already committed. A deal can only be
    // settled once, so re-creating a row already CREATED or SETTLED would
    // create a second, orphaned deal while the recorded one sits untouched.
    let dealNo = '';
    let resumeFrom: 'create' | 'settle' | 'post' = 'create';
    const prior = readArtifact(`tc-008-deal-${row.id}.json`);
    if (prior) {
      try {
        const p = JSON.parse(prior) as Outcome;
        if (p.verdict === 'POSTED') {
          log.note(`already POSTED as deal ${p.dealNo} - skipping (idempotent resume)`);
          results.push(p);
          return;
        }
        if (p.verdict === 'CREATED' || p.verdict === 'SETTLED') {
          dealNo = p.dealNo;
          out.dealNo = dealNo;
          out.verdict = p.verdict;
          resumeFrom = p.verdict === 'SETTLED' ? 'post' : 'settle';
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
          await captureEvidence(sapPage, `tc-008-${row.id}-blocked-dialog`);
          return;
        }
        if (filled.refused) {
          out.verdict = 'REFUSED';
          out.message = filled.refused;
          return;
        }

        // SAP reformats amount and rate on the round trip, so the amount is
        // compared numerically and the dates by string.
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

      if (resumeFrom !== 'post') {
        // ==================== WRITE 2: settle the deal ====================
        const settled = await settleDeal(sapPage, { companyCode: row.companyCode, dealNo }, ctx);
        if (settled.state === 'blocked') {
          out.message = settled.blocked ?? 'settlement blocked';
          return;
        }
        if (settled.state !== 'already-settled') {
          // Prove we are on the deal we asked for, and in settlement mode - not
          // still sitting on the entry screen because the button click was
          // swallowed. Mirrors TC-002's checks, which caught exactly this failure
          // mode (see ftr-term-loan-flow.spec.ts).
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

      // ========================= WRITE 3: post flows =========================
      const postArgs = {
        companyCode: row.companyCode, dealNo, dueDate: row.dueDate, postingDate: row.postingDate,
      };

      // Runs straight to the live commit - no Test Run simulation pass first,
      // per the requester's standing instruction (2026-08-18): never run a
      // screen with its Test Run checkbox checked. The checkbox is still
      // driven to false and read back, since it defaults to ON.
      const live = await postFlows(sapPage, postArgs, false, ctx);
      expect(live.blocked, `unexpected dialog in TBB1 live post: ${live.blocked}`).toBeNull();
      expect(live.selection.testRun, 'the live post must have cleared Test Run').toBe('false');
      expect(live.selection.dueDateCutoff, 'TBB1 due-date cutoff must match the requested date').toBe(row.dueDate);
      expect(live.selection.postingDate, 'TBB1 posting date must match the requested date').toBe(row.postingDate);
      expect(live.text, 'the live post must have selected this deal').toContain(dealNo);
      // "(test run)" in the log would mean nothing was posted, however healthy
      // the run looked.
      expect(live.text, 'the live run must not still be a simulation').not.toMatch(
        /test run was successful/i,
      );

      out.verdict = 'POSTED';
      out.message = `created ${dealNo}, settled, posted`;
    } catch (e) {
      out.verdict = out.verdict === 'PENDING' ? 'ERROR' : out.verdict;
      out.message = (e as Error).message.split('\n')[0].slice(0, 300);
      await dumpOnFailure(sapPage, `tc-008-${row.id}`);
    } finally {
      out.finishedAt = new Date().toISOString();
      log.flush(`tc-008-deal-${row.id}-log.txt`);
      results.push(out);
      log.note(`RESULT: ${out.verdict} deal=${out.dealNo || '-'} :: ${out.message}`);
    }
  });
}
