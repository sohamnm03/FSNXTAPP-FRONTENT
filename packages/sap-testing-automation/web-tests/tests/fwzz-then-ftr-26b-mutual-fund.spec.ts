import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect } from '../fixtures';
import { dumpOnFailure, writeArtifact } from '../webgui';
import { makeLogger } from '../modules/session';
import {
  openClassEntry, fillCreateDialog, fillClassBasicData, checkClass, saveClass,
  openMutualFundDealEntry, fillMutualFundDeal, checkMutualFundDeal, saveMutualFundDeal,
  type ClassData, type MutualFundDealSpec,
} from '../modules/securities';
import { journal } from '../journal';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * TC-019 — FWZZ create a Class (26B) then FTR_CREATE a deal against it, WebGUI.
 *
 * WRITES TO THE DATABASE (twice). Confirmed by the human before the run.
 *
 *   1. FWZZ Save — creates one new Class, product type 26B (Inv: Mutual
 *      Funds), server-assigned id.
 *   2. FTR_CREATE Save — creates one Investment transaction (26B/100)
 *      against that same class id, in company code 9990.
 *
 * The class half is TC-017's proven flow (three live runs: 300021, 300022,
 * 300023), factored into ../modules/securities.ts rather than duplicated.
 * The deal half is new - nothing in this workspace had driven FTR_CREATE
 * with product type 26B before this case was authored. Every field and
 * every quirk below came from live discovery, not guesswork (CLAUDE.md
 * rule 4):
 *
 *  - discover-ftr-26b-entry.spec.ts: the FTR_CREATE entry screen carries a
 *    "Security Class ID Number" field for 26B (same as 22B); company codes
 *    9800 and 1000 (the only two this workspace had used before) both
 *    refuse 26B outright - "Product type 26B not available in company code
 *    X".
 *  - discover-ftr-26b-cocode.spec.ts: read the Company Code field's own F4
 *    (12 codes) and tried each untested one live. `0001` and `9990` both
 *    accept 26B; this case uses `9990` ("XYZ Ltd", INR) per the requester's
 *    direction.
 *  - Enter from the entry screen reaches SAPLTTM_UI_FRAMEWORK/1110 - a
 *    completely different program from the term-loan screens
 *    (SAPLFTR_IRATE), the modern "Trading Transaction Manager" framework,
 *    with its own Check button (F6, not F8) and an 8-tab layout (Structure,
 *    Administr., Other Flows, Payment Details, Cash Flow, Memos, Partner
 *    Assignment, Status).
 *  - discover-ftr-26b-deal-fields.spec.ts: Securities Account's own F4
 *    returns exactly one row on this client (`1000`). General Valuation
 *    Class is a dropdown, not an F4 field - `openValueHelp` throws; `Short
 *    Term` (the same value FTR term loans use) is accepted.
 *  - discover-ftr-26b-deal-final-check.spec.ts: with Securities Account,
 *    General Valuation Class, Number of Units, Price, Calculation Date and
 *    Payment Date all filled, Check (F6) reports exactly one remaining
 *    message - "No payment details entered for transaction" - and it is a
 *    **warning**, not an error (the status text is literally prefixed
 *    "Warning:"). This case tolerates that one specific message and fails
 *    on any other.
 *  - Calculation Date / Payment Date are never hardcoded: SAP defaults
 *    Position Value Date to the run's own today on every attempt, and
 *    `fillMutualFundDeal` reads that back and reuses it, so the case never
 *    goes stale on the day it happens to run.
 *
 *   class-entry  - open FWZZ, press Create, stop            (no write)
 *   class-dialog - fill + confirm the Create Class dialog    (no write)
 *   class-basic  - fill Basic Data, Check                    (no write)
 *   class-save   - save the class                            WRITE 1
 *   deal-entry   - open FTR_CREATE with the new class id     (no write)
 *   deal-fill    - fill the deal screen, Check                (no write)
 *   deal-save    - save the deal                              WRITE 2
 *
 *   $env:FLOW_STAGE="deal-save"
 */

const STAGES = [
  'class-entry', 'class-dialog', 'class-basic', 'class-save',
  'deal-entry', 'deal-fill', 'deal-save',
] as const;
type Stage = (typeof STAGES)[number];

const STAGE = (process.env.FLOW_STAGE ?? 'class-entry') as Stage;
if (!STAGES.includes(STAGE)) {
  throw new Error(`FLOW_STAGE='${STAGE}' is not one of: ${STAGES.join(', ')}`);
}
const upTo = (s: Stage) => STAGES.indexOf(STAGE) >= STAGES.indexOf(s);

type DatasetFile = {
  id: string;
  case: string;
  defaults: {
    class: {
      productType: string; issuer: string; issueCurrency: string;
      issueStartDate?: string; nominalValue?: string;
    };
    deal: {
      companyCode: string; transactionType: string; partner: string;
      securitiesAccount: string; generalValuationClass: string;
    };
  };
  rows: Array<{
    id: string; label: string;
    class: { shortName: string; longName: string };
    deal: { numberOfUnits: string; price: string };
  }>;
};

function loadRow() {
  const path = resolve(repoRoot, 'test-data', 'fwzz-then-ftr-26b-mutual-fund.dataset.json');
  const ds: DatasetFile = JSON.parse(readFileSync(path, 'utf8'));
  const wanted = process.env.DATASET_ROWS ?? 'baseline';
  const row = ds.rows.find((r) => r.id === wanted);
  if (!row) {
    throw new Error(`DATASET_ROWS='${wanted}' not in ${ds.id}. Known: ${ds.rows.map((r) => r.id).join(', ')}`);
  }
  return { row, defaults: ds.defaults, datasetId: ds.id };
}

const { row, defaults, datasetId } = loadRow();

const classData: ClassData = {
  productType: defaults.class.productType,
  shortName: row.class.shortName,
  longName: row.class.longName,
  issuer: defaults.class.issuer,
  issueCurrency: defaults.class.issueCurrency,
  issueStartDate: defaults.class.issueStartDate,
  nominalValue: defaults.class.nominalValue,
};

const dealSpecFor = (classId: string): MutualFundDealSpec => ({
  companyCode: defaults.deal.companyCode,
  transactionType: defaults.deal.transactionType,
  partner: defaults.deal.partner,
  securitiesAccount: defaults.deal.securitiesAccount,
  generalValuationClass: defaults.deal.generalValuationClass,
  numberOfUnits: row.deal.numberOfUnits,
  price: row.deal.price,
});

const log = makeLogger();
const ctx = { note: log.note, tag: 'tc-019' };

test.afterEach(async ({ sapPage }, testInfo) => {
  log.flush('tc-019-flow-log.txt');
  if (testInfo.status !== testInfo.expectedStatus) {
    await dumpOnFailure(sapPage, `tc-019-${STAGE}`);
  }
});

test(`TC-019 FWZZ 26B class then FTR_CREATE deal (stage=${STAGE}, row=${row.id})`, async ({ sapPage }) => {
  test.setTimeout(300_000);

  journal.forCase('TC-019');
  journal.meta('stage', STAGE);
  journal.meta('dataset row', `${datasetId}/${row.id}`);
  log.note(`dataset row ${row.id}: ${row.label}`);

  // ================================================================ FWZZ
  await openClassEntry(sapPage, ctx);
  if (!upTo('class-dialog')) {
    journal.step('STAGE=class-entry - stopping before the dialog. Nothing written.', 'skipped');
    return;
  }

  await fillCreateDialog(sapPage, classData, ctx);
  if (!upTo('class-basic')) {
    journal.step('STAGE=class-dialog - stopping before Basic Data. Nothing written.', 'skipped');
    return;
  }

  await fillClassBasicData(sapPage, classData, ctx);
  await checkClass(sapPage, ctx);
  if (!upTo('class-save')) {
    journal.step('STAGE=class-basic - stopping before Save. Nothing written.', 'skipped');
    return;
  }

  // ======================================================= WRITE 1: class
  const classId = await saveClass(sapPage, ctx);
  writeArtifact('tc-019-class-id.txt', classId);
  expect(classId).toMatch(/\S/);

  if (!upTo('deal-entry')) {
    journal.step('STAGE=class-save - stopping after the class. Nothing further written.', 'skipped');
    return;
  }

  // ========================================================= FTR_CREATE
  const dealSpec = dealSpecFor(classId);
  await openMutualFundDealEntry(sapPage, classId, dealSpec, ctx);
  if (!upTo('deal-fill')) {
    journal.step('STAGE=deal-entry - stopping before the deal screen is filled. Nothing further written.', 'skipped');
    return;
  }

  const filled = await fillMutualFundDeal(sapPage, dealSpec, ctx);
  const units = parseFloat(filled.numberOfUnits.replace(/[\s,]/g, ''));
  expect(units, 'units must survive the round trip').toBeCloseTo(parseFloat(row.deal.numberOfUnits), 2);
  expect(filled.generalValuationClass.toLowerCase()).toContain(defaults.deal.generalValuationClass.toLowerCase());
  expect(filled.securitiesAccount).toBe(defaults.deal.securitiesAccount);

  await checkMutualFundDeal(sapPage, ctx);
  if (!upTo('deal-save')) {
    journal.step('STAGE=deal-fill - stopping before Save. Nothing further written.', 'skipped');
    return;
  }

  // ======================================================== WRITE 2: deal
  const saved = await saveMutualFundDeal(sapPage, ctx);
  writeArtifact('tc-019-deal-number.txt', saved.dealNumber);
  expect(saved.dealNumber).toMatch(/^\d{4,12}$/);

  log.note(`--- class ${classId}, deal ${saved.dealNumber} ---`);
});
