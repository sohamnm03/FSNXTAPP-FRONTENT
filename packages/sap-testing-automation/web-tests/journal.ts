/**
 * The run journal — what actually happened, recorded by the run itself.
 *
 * Everything else in this workspace was already model-free: the specs drive the
 * screens, `screens/*.json` holds the handles, `test-data/*.dataset.json` holds
 * the values. One thing was not. The record of a run — `results/TC-*.md`, the
 * file the dashboard reads, the freeze gate counts and the case's Run history
 * cites — was written afterwards, by hand, from a transcript. That is the last
 * place a human (or a model) stands between the system under test and the
 * report about it, and it is the worst place for one to stand: it is where
 * CLAUDE.md rules 5 and 6 are enforced by good intentions rather than by
 * mechanism.
 *
 * So the run emits its own record. A spec calls `step`, `check`, `document`
 * and `deviation` as it goes; each becomes one NDJSON line under
 * `results/web/<SYSTEM_ID>/journal/`. `reporters/result-file.ts` renders those
 * lines into the run file at the end. Nothing is transcribed, so nothing can be
 * embellished — an observed value in the report is the string that came off the
 * screen, and a field the run never read is absent here and prints as
 * `NOT OBSERVED` there, which is rule 6 as a data flow rather than as a promise.
 *
 * Three properties this file protects:
 *
 *  - **It never breaks a run.** Every entry point is wrapped: a journal that
 *    cannot write must not fail a test that is otherwise fine, because the
 *    expensive failure here is a real SAP write that gets rolled back over a
 *    reporting bug. A journal write that fails costs a thinner report.
 *  - **It never invents.** There is no defaulting, no inference and no
 *    "probably". `check` records the value it was handed; if a spec has nothing
 *    to hand it, the row says so.
 *  - **It is additive.** A spec that calls none of this still gets a run file —
 *    the reporter falls back to Playwright's own view (test titles, statuses,
 *    `expect` steps). Instrumenting a spec makes its report better; not
 *    instrumenting one does not make it silent.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test } from '@playwright-sap/test';
import { sapSystem } from './sap-system';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * One id per invocation, shared by every worker in it.
 *
 * `scripts/run-case.ps1` sets `SAP_RUN_ID` so the runner knows the filename
 * before Playwright starts. A bare `npx playwright test` gets a generated one,
 * so an ad-hoc run still produces a run file rather than silently skipping the
 * record.
 */
export const RUN_ID =
  process.env.SAP_RUN_ID?.trim() ||
  `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}-${process.pid}`;

/** Who is answerable for this run. Recorded, never guessed at render time. */
export const RUN_BY = process.env.SAP_RUN_BY?.trim() || '';

/** Optional suffix for the run filename, e.g. `create-only`. */
export const RUN_TAG = process.env.SAP_RUN_TAG?.trim() || '';

export type Outcome = 'ok' | 'skipped' | 'error' | 'refused' | 'blocked';

/**
 * `recorded` is not a weaker `pass` — it is the absence of a verdict.
 *
 * `check` writes down a value; it does not assert anything about it. Defaulting
 * that to `pass` would put a verdict in the report that nothing in the run ever
 * checked, which is rule 6 ("never invent a result") broken by a default
 * argument. Use `checked` to get a pass or a fail, or pass one explicitly.
 */
export type CheckResult = 'pass' | 'fail' | 'not-observed' | 'recorded';

export type JournalEntry =
  | { kind: 'meta'; testId: string; at: string; case?: string; key?: string; value?: string }
  | { kind: 'step'; testId: string; at: string; description: string; outcome: Outcome; detail?: string }
  | {
      kind: 'check';
      testId: string;
      at: string;
      description: string;
      expected: string;
      observed: string | null;
      result: CheckResult;
    }
  | {
      kind: 'document';
      testId: string;
      at: string;
      docType: string;
      number: string | null;
      companyCode?: string;
      lifecycle: string[];
      leftInPlace: boolean;
      note?: string;
    }
  | { kind: 'evidence'; testId: string; at: string; file: string; shows: string }
  | { kind: 'deviation'; testId: string; at: string; text: string }
  | {
      kind: 'system';
      testId: string;
      at: string;
      where: string;
      system: string;
      client: string;
      user?: string;
      /**
       * Whether the DS4/100 check actually held. Absent on journals written
       * before this field existed, which the reporter treats as "not stated"
       * rather than inventing a verdict either way.
       */
      confirmed?: boolean;
    }
  | { kind: 'verdict'; testId: string; at: string; verdict: string; why: string };

function journalDir() {
  return resolve(repoRoot, 'results', 'web', sapSystem.id, 'journal');
}

export function journalPath(runId = RUN_ID) {
  return resolve(journalDir(), `${runId}.ndjson`);
}

/**
 * Which test a line belongs to.
 *
 * `test.info()` is the runner's own view of what is executing, so entries group
 * per test without any spec passing an id around — and it stays correct inside
 * `treasury.ts`, which is called by nine different specs and knows nothing
 * about any of them. Called outside a test (module scope, a global hook) it
 * throws; `-` groups those lines under the run itself rather than dropping
 * them.
 */
function currentTestId(): string {
  try {
    return test.info().testId;
  } catch {
    return '-';
  }
}

/**
 * Append one line. Swallows every error on purpose — see the header: a report
 * that cannot be written must not fail a test that is otherwise fine.
 */
function emit(entry: Omit<JournalEntry, 'testId' | 'at'> & Record<string, unknown>) {
  try {
    mkdirSync(journalDir(), { recursive: true });
    const line = JSON.stringify({
      ...entry,
      testId: currentTestId(),
      at: new Date().toISOString(),
    });
    appendFileSync(journalPath(), line + '\n', 'utf8');
  } catch {
    /* the run matters more than the record of it */
  }
}

/** Which case this test is a run of. Without it the reporter has no filename. */
export function forCase(caseId: string) {
  emit({ kind: 'meta', case: caseId });
}

/** A free-form fact for the run file's header, e.g. dataset row or stage. */
export function meta(key: string, value: string) {
  emit({ kind: 'meta', key, value: String(value) });
}

/** One row of the run file's "Steps executed" table. */
export function step(description: string, outcome: Outcome = 'ok', detail?: string) {
  emit({ kind: 'step', description, outcome, detail });
}

/**
 * One row of the "Assertions" table, with the value that was actually read.
 *
 * `observed` is whatever came off the screen — pass it through unchanged, even
 * when it is ugly (`100,000.00`, `10.0000000`). Reformatting it here would make
 * the report say something the system did not.
 *
 * Returns `observed` so it can wrap an existing expression, and records
 * `not-observed` for a null/undefined read rather than printing an empty cell.
 *
 * With no explicit `result` the row is `recorded`, not `pass`: this function
 * asserts nothing, and claiming a verdict it did not reach would be inventing
 * one. `checked` is the version that asserts.
 */
export function check(
  description: string,
  expected: unknown,
  observed: unknown,
  result?: CheckResult,
): string | null {
  const obs =
    observed === null || observed === undefined || observed === ''
      ? null
      : String(observed);
  emit({
    kind: 'check',
    description,
    expected: String(expected),
    observed: obs,
    result: result ?? (obs === null ? 'not-observed' : 'recorded'),
  });
  return obs;
}

/**
 * Record a check and assert it in one call, so the report and the verdict can
 * never disagree.
 *
 * The failure path matters more than the happy one: `assertFn` throwing records
 * the row as `fail` *before* the error propagates, so a run that dies on its
 * third assertion still reports the first two and the one that killed it. A
 * spec that asserts without recording leaves the reporter to infer the row from
 * Playwright's `expect` step, which knows the description but not the value.
 */
export function checked<T>(
  description: string,
  expected: unknown,
  observed: T,
  assertFn: (observed: T) => void,
): T {
  try {
    assertFn(observed);
  } catch (e) {
    check(description, expected, observed, 'fail');
    throw e;
  }
  check(description, expected, observed, 'pass');
  return observed;
}

/**
 * A business object this run wrote. One row of "Documents created".
 *
 * `number` is null when the write was attempted and no number came back — that
 * is a real, reportable state ("attempted, wrote nothing") and is not the same
 * as no row at all. `scripts/build-dashboard.ps1` distinguishes them.
 */
export function document(args: {
  docType: string;
  number: string | null;
  companyCode?: string;
  lifecycle?: string[];
  leftInPlace?: boolean;
  note?: string;
}) {
  emit({
    kind: 'document',
    docType: args.docType,
    number: args.number || null,
    companyCode: args.companyCode,
    lifecycle: args.lifecycle ?? [],
    leftInPlace: args.leftInPlace ?? true,
    note: args.note,
  });
}

/** Extend a document's lifecycle after a later step, e.g. settled -> posted. */
export function documentReached(number: string, stage: string) {
  emit({ kind: 'document', docType: '', number, lifecycle: [stage], leftInPlace: true });
}

/** One row of "Evidence". `file` is repo-relative. */
export function evidence(file: string, shows: string) {
  emit({ kind: 'evidence', file, shows });
}

/**
 * Something that differed from the case.
 *
 * This is the field the freeze gate reads: `scripts/check-suite.ps1` refuses to
 * count a PASS run that recorded a deviation toward the two clean runs a case
 * needs to freeze. Recording one therefore costs something, which is exactly
 * why it has to be the run that records it and not a narrator deciding later
 * whether the popup "really counted".
 */
export function deviation(text: string) {
  emit({ kind: 'deviation', text });
}

/**
 * The system confirmation behind CLAUDE.md rule 1, as a recorded fact.
 *
 * `confirmed` is the verdict of the DS4/100 check, not the fact that a check was
 * attempted. Callers record the failing case too — what the screen said is
 * evidence — so the reporter must read this flag rather than treating the
 * presence of an entry as a pass.
 */
export function systemConfirmed(
  where: string,
  info: { system: string; client: string; user?: string; confirmed?: boolean },
) {
  emit({
    kind: 'system',
    where,
    system: info.system,
    client: info.client,
    user: info.user,
    confirmed: info.confirmed,
  });
}

/**
 * Override the verdict the reporter would otherwise derive.
 *
 * Only for the verdicts Playwright cannot see. A precondition that was not met
 * is `BLOCKED`, not a failure of the product, and a batch that wrote six of ten
 * rows is `PARTIAL` even though every test in it passed — neither is visible
 * from a green test result, and both change what the dashboard says.
 */
export function verdict(v: 'PASS' | 'FAIL' | 'BLOCKED' | 'PARTIAL', why: string) {
  emit({ kind: 'verdict', verdict: v, why });
}

export const journal = {
  RUN_ID,
  RUN_BY,
  RUN_TAG,
  forCase,
  meta,
  step,
  check,
  checked,
  document,
  documentReached,
  evidence,
  deviation,
  systemConfirmed,
  verdict,
};
