/**
 * Data-driven test input — the data table a case iterates, kept out of the spec.
 *
 * A dataset in ../test-data/<id>.dataset.json holds a `defaults` block and a list
 * of `rows`; a resolved row is defaults + row + the derived dates below. One spec
 * then runs the same steps once per row, so adding an eleventh term loan is a
 * data edit, not a code edit.
 *
 * Three things are deliberate:
 *
 *  - **Derived dates.** Contract Date must be <= Term Start or SAP refuses the
 *    save outright, and the TBB1 due-date cutoff and posting date are the deal's
 *    own start date in every row written so far. All three default to
 *    `startDate`, so the constraint lives in one place instead of being retyped
 *    correctly thirty times. An explicit value still wins.
 *  - **Validation on load, not on use.** A malformed date or a duplicate row id
 *    fails before the browser opens. A dataset that reaches SAP with a bad date
 *    burns a real save on a refusal.
 *  - **No defaulting of business values.** Amount, term and partner are never
 *    invented — a row missing one is an error, because every value this suite
 *    writes to a live client was agreed in advance.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sapSystem } from './sap-system';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-data');

/** Fields a row may carry. Values are SAP-format strings, never numbers or Dates. */
export type DatasetRow = {
  id: string;
  label?: string;
  companyCode: string;
  productType: string;
  transactionType: string;
  partner: string;
  amount: string;
  currency: string;
  interestRate: string;
  startDate: string;
  endDate: string;
  /** Defaults to startDate — must be <= startDate or the save is refused. */
  contractDate: string;
  /** TBB1 selection cutoff. Defaults to startDate. */
  dueDate: string;
  /** TBB1 Posting Control date. Defaults to startDate. */
  postingDate: string;
  /** Frequency Indicator entry. Absent leaves SAP's default. */
  interestFrequency?: string;
  /** FTR_CREATE deal screen's Administr. tab dropdown. Absent leaves it unset - required for some product types, not others. */
  generalValuationClass?: string;
  /** FTR_CREATE deal screen's Interest Category dropdown. Absent leaves SAP's default (Fixed). */
  interestCategory?: string;
  /** Only meaningful when interestCategory is 'Variable' - required in that case instead of interestRate. */
  referenceInterestRate?: string;
  /** TPM44/TPM1 Valuation Area selection field. Absent means the row does not drive those transactions. */
  valuationArea?: string;
  /** TPM44/TPM1 Valuation Class selection field, paired with valuationArea. */
  valuationClass?: string;
  /** TPM1's mandatory Valuation Category dropdown. TPM1 will not execute without it. */
  valuationCategory?: string;
  /** TPM44 Accrual/Deferral Key Date and TPM1 Key Date for Valuation. */
  keyDate?: string;
};

export type Dataset = {
  id: string;
  case: string;
  description: string;
  authorised: string;
  writesPerRow: number;
  /**
   * The registry id of the system this dataset's business values are valid on.
   *
   * Company codes, product types, partners and security classes are master
   * data - they exist on the landscape they were discovered on and nowhere
   * else by right. Running NIIF's data against another system does not fail
   * cleanly; it burns real saves on refusals, or worse, matches a *different*
   * partner that happens to share the number. Absent means "not yet declared"
   * and is allowed, so existing datasets keep working.
   */
  system?: string;
  rows: DatasetRow[];
};

const REQUIRED = [
  'companyCode', 'productType', 'transactionType', 'partner',
  'amount', 'currency', 'startDate', 'endDate',
] as const;

const SAP_DATE = /^\d{2}\.\d{2}\.\d{4}$/;

/** dd.mm.yyyy -> a comparable number. Used only to check ordering. */
function dateKey(d: string): number {
  const [dd, mm, yyyy] = d.split('.');
  return Number(`${yyyy}${mm}${dd}`);
}

export function loadDataset(id: string): Dataset {
  const path = resolve(dataDir, `${id}.dataset.json`);
  let raw: {
    id: string; case: string; description: string; authorised: string;
    writesPerRow?: number;
    system?: string;
    defaults: Record<string, string>;
    rows: Record<string, string>[];
  };
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`cannot read dataset '${id}' at ${path}: ${(e as Error).message}`);
  }

  if (raw.id !== id) throw new Error(`dataset ${path}: id '${raw.id}' does not match its filename`);
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
    throw new Error(`dataset '${id}' has no rows`);
  }

  // Master data is landscape-specific. Refusing here costs nothing; discovering
  // it at the save means a refused write on a live client, and a partner number
  // that resolves to a *different* real partner elsewhere would not even refuse.
  if (raw.system && raw.system !== sapSystem.id) {
    throw new Error(
      `dataset '${id}' declares system '${raw.system}' but this run targets ` +
        `'${sapSystem.id}'. Its company codes, product types and partners are master ` +
        `data valid on '${raw.system}' - they do not carry across landscapes. Point ` +
        `SAP_SYSTEM_ID at '${raw.system}', or write a dataset for '${sapSystem.id}' ` +
        `with values discovered there.`,
    );
  }

  const seen = new Set<string>();
  const rows: DatasetRow[] = raw.rows.map((r, i) => {
    const merged = { ...raw.defaults, ...r };
    const rowId = merged.id ?? String(i + 1).padStart(2, '0');

    if (seen.has(rowId)) throw new Error(`dataset '${id}': duplicate row id '${rowId}'`);
    seen.add(rowId);

    for (const key of REQUIRED) {
      if (!merged[key]) {
        throw new Error(`dataset '${id}' row '${rowId}': missing required field '${key}'`);
      }
    }

    // interestRate is required, unless the row asks for a variable rate - then
    // there is no fixed nominal rate to supply, and referenceInterestRate is
    // required instead (SAP demands it once Interest Category = Variable; see
    // TC-003's V10 discovery and TC-013's).
    const isVariableRate = (merged.interestCategory ?? '').trim().toLowerCase() === 'variable';
    if (isVariableRate) {
      if (!merged.referenceInterestRate) {
        throw new Error(
          `dataset '${id}' row '${rowId}': interestCategory is 'Variable' but referenceInterestRate is missing`,
        );
      }
    } else if (!merged.interestRate) {
      throw new Error(`dataset '${id}' row '${rowId}': missing required field 'interestRate'`);
    }

    const startDate = merged.startDate;
    const contractDate = merged.contractDate ?? startDate;
    const dueDate = merged.dueDate ?? startDate;
    const postingDate = merged.postingDate ?? startDate;

    for (const [name, value] of Object.entries({
      startDate, endDate: merged.endDate, contractDate, dueDate, postingDate,
    })) {
      if (!SAP_DATE.test(value)) {
        throw new Error(`dataset '${id}' row '${rowId}': ${name} '${value}' is not dd.mm.yyyy`);
      }
    }
    if (dateKey(contractDate) > dateKey(startDate)) {
      throw new Error(
        `dataset '${id}' row '${rowId}': contractDate ${contractDate} is after startDate ${startDate} - ` +
          `SAP refuses this save ("Contract date is after start of term")`,
      );
    }
    if (dateKey(merged.endDate) <= dateKey(startDate)) {
      throw new Error(
        `dataset '${id}' row '${rowId}': endDate ${merged.endDate} is not after startDate ${startDate}`,
      );
    }
    if (!/^\d+(\.\d+)?$/.test(merged.amount)) {
      throw new Error(`dataset '${id}' row '${rowId}': amount '${merged.amount}' is not a plain number`);
    }
    if (merged.keyDate && !SAP_DATE.test(merged.keyDate)) {
      throw new Error(`dataset '${id}' row '${rowId}': keyDate '${merged.keyDate}' is not dd.mm.yyyy`);
    }

    return {
      id: rowId,
      label: merged.label,
      companyCode: merged.companyCode,
      productType: merged.productType,
      transactionType: merged.transactionType,
      partner: merged.partner,
      amount: merged.amount,
      currency: merged.currency,
      interestRate: merged.interestRate ?? '',
      startDate,
      endDate: merged.endDate,
      contractDate,
      dueDate,
      postingDate,
      interestFrequency: merged.interestFrequency,
      generalValuationClass: merged.generalValuationClass,
      interestCategory: merged.interestCategory,
      referenceInterestRate: merged.referenceInterestRate,
      valuationArea: merged.valuationArea,
      valuationClass: merged.valuationClass,
      valuationCategory: merged.valuationCategory,
      keyDate: merged.keyDate,
    };
  });

  return {
    id: raw.id,
    case: raw.case,
    description: raw.description,
    authorised: raw.authorised,
    writesPerRow: raw.writesPerRow ?? 0,
    system: raw.system,
    rows,
  };
}

/**
 * Narrow a dataset to the rows this run should drive.
 *
 *   $env:DATASET_ROWS="03,07"    # only those two
 *
 * An id that is not in the dataset is an error, not a silent no-op: a typo would
 * otherwise look like a clean run that quietly wrote nothing.
 */
export function selectRows(ds: Dataset, spec = process.env.DATASET_ROWS): DatasetRow[] {
  const wanted = (spec ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (wanted.length === 0) return ds.rows;

  const unknown = wanted.filter((w) => !ds.rows.some((r) => r.id === w));
  if (unknown.length) {
    throw new Error(
      `DATASET_ROWS names rows not in '${ds.id}': ${unknown.join(', ')}. ` +
        `Known: ${ds.rows.map((r) => r.id).join(', ')}`,
    );
  }
  return ds.rows.filter((r) => wanted.includes(r.id));
}
