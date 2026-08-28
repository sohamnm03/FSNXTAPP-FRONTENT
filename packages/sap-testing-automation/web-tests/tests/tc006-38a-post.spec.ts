import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, screenInfo, clickButton, statusMessage,
  writeArtifact, bodyText, captureEvidence, handleKnownPopups, handleSaveDialogs,
  setCheckbox,
} from '../webgui';

/**
 * TC-006 completion: the 38A/100 Letter of Credit deal already exists on
 * company code 9999 (transaction 100011) with counterparty BP 400000000 and
 * Beneficiary BP 400000001 - discovered read-only via probe-existing-deal.
 * It was already created and settled (cash flow flagged for posting); the
 * only remaining step of the create->settle->post cycle is TBB1.
 *
 * TBB1 runs straight to the live commit when POST=1 - no Test Run simulation
 * pass first, per the requester's standing instruction (2026-08-18): never
 * run a screen with its Test Run checkbox checked. Without POST=1, TBB1 is
 * not run at all (there is no simulate-only mode left to fall back to).
 *
 *   npx playwright test tests/tc006-38a-post.spec.ts          (settlement check only, nothing written)
 *   $env:POST="1"; npx playwright test tests/tc006-38a-post.spec.ts   (WRITES - live TBB1 post)
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag|posting log|logs and messages/i;

const COMPANY_CODE = '9999';
const DEAL_NO = '100011';
const DUE_DATE = (process.env.DUE_DATE ?? '31.01.2026').trim();
const POSTING_DATE = (process.env.POSTING_DATE ?? '31.01.2026').trim();
const DO_POST = process.env.POST === '1';

test(`TC-006 38A cycle: complete deal ${COMPANY_CODE}/${DEAL_NO} (post=${DO_POST})`, async ({ sapPage }) => {
  test.setTimeout(300_000);
  const log: string[] = [];
  const note = (s: string) => { log.push(s); console.log(s); };

  // ============================================================== FTR_EDIT
  await openTransaction(sapPage, 'FTR_EDIT');
  let info = await screenInfo(sapPage);
  note(`SYSTEM @FTR_EDIT: ${JSON.stringify(info)}`);
  expect(info.system, 'must be DS4').toContain('DS4');
  expect(info.client, 'must be client 100').toContain('100');

  await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
  await setFieldVerified(sapPage, 'Financial Transaction', DEAL_NO);
  note('clicking Settle (M0:46:::5:8)');
  await clickButton(sapPage, 'M0:46:::5:8');

  const popups = await handleSaveDialogs(sapPage, SAFE_POPUP, note);
  expect(popups.blocked, `unexpected dialog opening settlement: ${popups.blocked}`).toBeNull();

  const settleText = await bodyText(sapPage);
  const settleStatus = await statusMessage(sapPage);
  note(`settle screen status: "${settleStatus}"`);
  writeArtifact(`tc006-${COMPANY_CODE}-${DEAL_NO}-settle-screen.txt`, settleText);

  // A fourth wording, specific to this LC screen program (SAPLFTR_TLC/1100,
  // t-code FTRTLC04), beyond the two documented in business-area-flows.spec.ts:
  // "Error: Transaction belongs to activity category Contract Settlement".
  const alreadySettled = /settlement already carried out|not available for activity category|belongs to activity category/i.test(
    `${settleText} ${settleStatus}`,
  );
  note(`already settled: ${alreadySettled}`);
  if (!alreadySettled) {
    note('NOT already settled - this run does not attempt to save a settlement, stopping here to avoid an unplanned write.');
    writeArtifact(`tc006-${COMPANY_CODE}-${DEAL_NO}-flow-log.txt`, log.join('\n'));
    return;
  }

  // ================================================================== TBB1
  async function runTbb1(testRun: boolean) {
    await openTransaction(sapPage, 'TBB1');
    info = await screenInfo(sapPage);
    expect(info.system, 'must be DS4').toContain('DS4');
    expect(info.client, 'must be client 100').toContain('100');

    await setFieldVerified(sapPage, 'Company Code', COMPANY_CODE);
    await setFieldVerified(sapPage, 'Financial Transaction', DEAL_NO, 0);
    await setFieldVerified(sapPage, 'Payment or Delivery Date', DUE_DATE);
    await setFieldVerified(sapPage, 'Posting Date in the Document', POSTING_DATE, 1);
    await setCheckbox(sapPage, 'M0:46:::31:5', testRun, note);

    note(`TBB1 selection (testRun=${testRun}): due=${DUE_DATE} posting=${POSTING_DATE}`);
    await clickButton(sapPage, 'M0:50::btn[8]', 60_000);

    const p = await handleSaveDialogs(sapPage, SAFE_POPUP, note);
    expect(p.blocked, `unexpected dialog in TBB1: ${p.blocked}`).toBeNull();

    const text = await bodyText(sapPage);
    const status = await statusMessage(sapPage);
    note(`TBB1 status (testRun=${testRun}): "${status}"`);
    writeArtifact(`tc006-${COMPANY_CODE}-${DEAL_NO}-tbb1-${testRun ? 'testrun' : 'live'}.txt`, `status: ${status}\n\n${text}`);
    note(`  evidence: ${await captureEvidence(sapPage, `tc006-${COMPANY_CODE}-${DEAL_NO}-tbb1-${testRun ? 'testrun' : 'live'}`)}`);
    return { text, status };
  }

  if (!DO_POST) {
    note('POST env var not set to "1" - not running TBB1 (no simulate-only mode; a run always writes). Nothing written.');
    writeArtifact(`tc006-${COMPANY_CODE}-${DEAL_NO}-flow-log.txt`, log.join('\n'));
    return;
  }

  // Runs straight to the live commit - no Test Run simulation pass first (see
  // the header comment). Test Run is still driven to false and read back.
  note(`*** WRITE: TBB1 live post - this commits to DS4/100 ***`);
  const live = await runTbb1(false);
  expect(live.text, 'the live post must have selected this deal').toContain(DEAL_NO);
  expect(live.text, 'the live run must not read as a simulation').not.toMatch(/test run was successful/i);
  note('--- flow complete ---');
  writeArtifact(`tc006-${COMPANY_CODE}-${DEAL_NO}-flow-log.txt`, log.join('\n'));
});
