/**
 * Writes `results/TC-<case>-<date>-<time>.md` at the end of a run.
 *
 * This is the half of the loop that used to need a person: the specs already
 * drove SAP unattended, but the file that says what happened — the one
 * `scripts/build-dashboard.ps1` renders, `scripts/check-suite.ps1` counts and
 * the case's Run history cites — was transcribed afterwards from a session
 * transcript. Transcription is where a report drifts from a run, and this
 * workspace's two hardest rules (5: record what actually happened, 6: never
 * invent a result) both live exactly there.
 *
 * The reporter reads two sources and merges them:
 *
 *  - **The run journal** (`../journal.ts`) — what the spec recorded as it went:
 *    steps, assertions *with the values that came off the screen*, documents,
 *    evidence, deviations. Authoritative wherever present.
 *  - **Playwright's own view** — test titles, statuses, errors, and every
 *    `expect` step. Always available, needs no spec change, and is what makes
 *    an uninstrumented spec produce a real run file instead of nothing.
 *
 * The fallback is the point. Nine regression specs exist today and none of them
 * knew about any of this; each still gets a correctly named, correctly shaped
 * run file from the moment this is switched on. Instrumenting a spec upgrades
 * its report from "these assertions held" to "this field read 100,000.00" — it
 * is not the difference between a report and silence.
 *
 * What it will not do is fill a gap in. An assertion Playwright saw pass but
 * whose value nobody recorded prints `NOT OBSERVED` in the Observed column and
 * `pass` in Result — both true, neither invented. There is no code path here
 * that writes an expected value into an observed cell.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep,
} from '@playwright-sap/test/reporter';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const caseDir = resolve(repoRoot, 'test-cases');
const resultsDir = resolve(repoRoot, 'results');

// ------------------------------------------------------------------ journal

type Entry = Record<string, any> & { kind: string; testId: string; at: string };

function readJournal(runId: string, systemId: string): Entry[] {
  const path = resolve(repoRoot, 'results', 'web', systemId, 'journal', `${runId}.ndjson`);
  if (!existsSync(path)) return [];
  const out: Entry[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // A torn last line (killed run) is not a reason to lose the rest.
    }
  }
  return out;
}

// -------------------------------------------------------------- case lookup

/**
 * Which case a spec is the executable copy of, from the case files themselves.
 *
 * `scripts/check-suite.ps1` reads the same `- **Spec file:**` line for the same
 * purpose. Deriving it here rather than keeping a second mapping means a spec
 * renamed in one place cannot end up filed under the wrong case in the other —
 * the case file stays the single statement of which spec proves it.
 */
/**
 * Every case file under `test-cases/`, as paths relative to it.
 *
 * Cases are filed by lane -- `test-cases/GUI-TC/` and `test-cases/Web-TC/` --
 * so a flat read of the folder finds nothing. One level of recursion covers
 * the lane folders and any future sibling, and returning the relative path
 * (not just the basename) keeps the `- **Case:**` line clickable.
 */
function caseFiles(): string[] {
  if (!existsSync(caseDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(caseDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const inner of readdirSync(resolve(caseDir, entry.name))) {
        if (/^TC-\d+.*\.md$/.test(inner)) out.push(`${entry.name}/${inner}`);
      }
    } else if (/^TC-\d+.*\.md$/.test(entry.name)) {
      out.push(entry.name);
    }
  }
  return out.sort();
}

function specToCase(): Map<string, { id: string; file: string }> {
  const map = new Map<string, { id: string; file: string }>();
  if (!existsSync(caseDir)) return map;

  for (const rel of caseFiles()) {
    const file = rel.split('/').pop()!;
    const text = readFileSync(resolve(caseDir, rel), 'utf8');
    const idMatch = text.match(/^\s*[-*]\s*\*\*Case id:\*\*\s*(TC-\d+)/m);
    const id = idMatch?.[1] ?? file.match(/^(TC-\d+)/)?.[1];
    if (!id) continue;

    // One line may name a spec plus a note: `...spec.ts` (`DEAL_KEY=MM`).
    // Take every spec it mentions, the way check-suite.ps1 does.
    for (const line of text.split('\n')) {
      if (!/^\s*[-*]\s*\*\*(Spec file|Verification spec):\*\*/.test(line)) continue;
      for (const m of line.matchAll(/([A-Za-z0-9._-]+\.spec\.ts)/g)) {
        if (!map.has(m[1])) map.set(m[1], { id, file: `test-cases/${rel}` });
      }
    }
  }
  return map;
}

// ------------------------------------------------------------------ shaping

/** Table cells are pipe-delimited; a value containing one would split the row. */
function cell(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function stamp(d: Date): { date: string; time: string; human: string } {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return { date, time, human: `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function minutes(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

type CaseRun = {
  caseId: string;
  casePath: string | null;
  tests: { test: TestCase; result: TestResult }[];
  entries: Entry[];
};

export default class ResultFileReporter implements Reporter {
  private startedAt = new Date();
  private config!: FullConfig;
  private tests: { test: TestCase; result: TestResult }[] = [];
  /** `expect` steps, per test, in the order the run made them. */
  private expects = new Map<string, { title: string; error?: string }[]>();

  printsToStdio() {
    return false;
  }

  onBegin(config: FullConfig, _suite: Suite) {
    this.config = config;
    this.startedAt = new Date();
  }

  onStepEnd(test: TestCase, _result: TestResult, step: TestStep) {
    // Playwright records one step per `expect`, titled with the message the
    // spec passed - `expect(x, 'amount must survive the round trip')`. That is
    // a written assertion, already in the specs, costing nothing to harvest.
    if (step.category !== 'expect') return;
    const list = this.expects.get(test.id) ?? [];
    list.push({ title: step.title, error: step.error?.message });
    this.expects.set(test.id, list);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.tests.push({ test, result });
  }

  async onEnd(result: FullResult) {
    try {
      this.write(result);
    } catch (e) {
      // Never let reporting fail a run that already touched a live client.
      console.error(`[result-file] could not write the run file: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- writing

  private write(_full: FullResult) {
    if (!this.tests.length) return;

    // Opt-in, and deliberately so.
    //
    // The model-driven way of working still exists and still writes its own run
    // file by hand from what it watched happen. If this reporter also wrote one
    // on every `npx playwright test`, every such session would produce two
    // records of one run - double-counted by scripts/build-dashboard.ps1 and,
    // worse, by the freeze gate in scripts/check-suite.ps1, where two files
    // from a single passing run would satisfy "must pass twice" on its own.
    //
    // So the run file is written only when a run asked to be recorded, by
    // SAP_WRITE_RESULT=1 - which scripts/run-case.ps1 sets, and which anyone can
    // set for an ad-hoc `npx playwright test`. Nothing about the existing
    // workflow changes unless it is set.
    //
    // Deliberately not SAP_RUN_ID: playwright.config.ts fills that in on every
    // run so the workers and this reporter agree on a journal filename, which
    // makes it useless as a signal of intent.
    if (process.env.SAP_WRITE_RESULT !== '1') return;

    const systemId = process.env.SAP_SYSTEM_ID?.trim() || this.defaultSystemId();
    const runId =
      process.env.SAP_RUN_ID?.trim() ||
      `${this.startedAt.toISOString().replace(/[-:T]/g, '').slice(0, 12)}-x`;

    const entries = readJournal(runId, systemId);
    const byTest = new Map<string, Entry[]>();
    for (const e of entries) {
      const list = byTest.get(e.testId) ?? [];
      list.push(e);
      byTest.set(e.testId, list);
    }

    const lookup = specToCase();
    const runs = new Map<string, CaseRun>();

    for (const t of this.tests) {
      const mine = byTest.get(t.test.id) ?? [];
      const declared = mine.find((e) => e.kind === 'meta' && e.case)?.case as string | undefined;
      const spec = basename(t.test.location.file);
      const fromCaseFile = lookup.get(spec);
      const fromTitle = t.test.title.match(/\b(TC-\d+)\b/)?.[1];

      const caseId = declared ?? fromCaseFile?.id ?? fromTitle ?? null;
      // A spec with no case is a discovery or verification run. Those have no
      // case file to file a result under, and inventing one would put an
      // exploratory probe in the regression record.
      if (!caseId) continue;

      const key = caseId;
      const existing = runs.get(key) ?? {
        caseId,
        casePath: fromCaseFile?.file ?? this.findCaseFile(caseId),
        tests: [],
        entries: [],
      };
      existing.tests.push(t);
      existing.entries.push(...mine);
      runs.set(key, existing);
    }

    // Entries emitted outside any test (module scope, global hooks) belong to
    // the run, so they go to every case it produced rather than being lost.
    const loose = byTest.get('-') ?? [];
    if (loose.length && runs.size) {
      for (const r of runs.values()) r.entries.push(...loose);
    }

    for (const run of runs.values()) this.writeCase(run, systemId);
  }

  /** The system the specs resolved, without importing sap-system into the reporter. */
  private defaultSystemId(): string {
    try {
      const registry = JSON.parse(
        readFileSync(resolve(repoRoot, 'config', 'sap-systems.json'), 'utf8'),
      );
      return registry.defaultSystem as string;
    } catch {
      return 'unknown-system';
    }
  }

  private findCaseFile(caseId: string): string | null {
    const hit = caseFiles().find((f) => f.split('/').pop()!.startsWith(`${caseId}-`));
    return hit ? `test-cases/${hit}` : null;
  }

  private writeCase(run: CaseRun, systemId: string) {
    const { date, time, human } = stamp(this.startedAt);
    const tag = process.env.SAP_RUN_TAG?.trim();
    const base = `${run.caseId}-${date}-${time}${tag ? `-${tag.replace(/[^A-Za-z0-9._-]+/g, '-')}` : ''}`;

    mkdirSync(resultsDir, { recursive: true });
    let name = `${base}.md`;
    let n = 2;
    while (existsSync(resolve(resultsDir, name))) {
      name = `${base}-${n++}.md`;
    }

    const md = this.render(run, systemId, human);
    writeFileSync(resolve(resultsDir, name), md, 'utf8');
    console.log(`[result-file] results/${name}`);

    // A machine-readable pointer for scripts/run-case.ps1, which prints the
    // verdict and the path without re-parsing the markdown it just caused.
    const pointer = process.env.SAP_RUN_POINTER?.trim();
    if (pointer) {
      appendFileSync(
        pointer,
        JSON.stringify({ case: run.caseId, file: `results/${name}`, verdict: this.verdictOf(run) }) + '\n',
        'utf8',
      );
    }
  }

  // --------------------------------------------------------------- verdict

  private verdictOf(run: CaseRun): string {
    const override = [...run.entries].reverse().find((e) => e.kind === 'verdict');
    if (override) return String(override.verdict);

    const failed = run.tests.filter(
      (t) => t.result.status !== 'passed' && t.result.status !== 'skipped',
    );
    const skipped = run.tests.filter((t) => t.result.status === 'skipped');

    if (failed.length && failed.length < run.tests.length) return 'PARTIAL';
    if (failed.length) return 'FAIL';
    if (skipped.length && skipped.length === run.tests.length) return 'BLOCKED';
    if (skipped.length) return 'PARTIAL';
    return 'PASS';
  }

  // ---------------------------------------------------------------- render

  private render(run: CaseRun, systemId: string, human: string): string {
    const E = run.entries;
    const pick = (kind: string) => E.filter((e) => e.kind === kind);

    const verdict = this.verdictOf(run);
    const duration = run.tests.reduce((sum, t) => sum + t.result.duration, 0);

    const out: string[] = [];
    out.push(`# ${run.caseId} — run ${human}`, '');

    // ---- header. Every value here is observed or supplied, none derived.
    const sys = pick('system');
    // The presence of a `system` entry means the check was *attempted*, not that
    // it passed — assertDevSystem records the failing read too, because what the
    // screen said is evidence. A run that read the wrong system used to print
    // "confirmed: yes" here purely because a row existed. `confirmed === false`
    // on any entry means rule 1 was not satisfied somewhere in this run.
    const refuted = sys.some((s) => s.confirmed === false);
    // Journals written before `confirmed` existed carry no flag; those are
    // reported as attempted-but-unstated rather than assumed either way.
    const unstated = sys.length > 0 && sys.every((s) => s.confirmed === undefined);
    const confirmed = sys.length > 0 && !refuted && !unstated;

    let systemLine: string;
    if (sys.length === 0) {
      systemLine = `${systemId} (registry id — no screen confirmation recorded this run)`;
    } else {
      const bad = sys.find((s) => s.confirmed === false) ?? sys[0];
      systemLine = `${bad.system || 'NOT OBSERVED'} / client ${bad.client || 'NOT OBSERVED'}`;
    }
    const user = sys.find((s) => s.user)?.user;

    let confirmedText: string;
    if (refuted) confirmedText = '**NO — the DS4/100 check FAILED on this run**';
    else if (unstated) confirmedText = 'attempted (verdict not recorded by this run)';
    else confirmedText = confirmed ? 'yes' : 'no';

    out.push(`- **Case:** \`${run.casePath ?? `test-cases/${run.caseId}`}\``);
    out.push(
      `- **System:** ${systemLine} — **confirmed via \`screenInfo\`${
        sys.length > 1 ? ` at ${sys.length} t-codes` : ''
      }:** ${confirmedText}`,
    );
    out.push(
      `- **Session:** WebGUI (\`playwright-sap\`), user \`${user ?? 'NOT OBSERVED'}\`, headed browser`,
    );
    out.push(`- **Run by:** ${process.env.SAP_RUN_BY?.trim() || 'unattended run (scripts/run-case.ps1)'}`);
    if (process.env.SAP_RUN_COMMAND?.trim()) {
      out.push(`- **Command:** \`${process.env.SAP_RUN_COMMAND.trim()}\``);
    }
    out.push(`- **Wall clock:** ${minutes(duration)}`);

    const metas = pick('meta').filter((m) => m.key);
    for (const m of metas) out.push(`- **${m.key}:** ${m.value}`);

    const why = [...E].reverse().find((e) => e.kind === 'verdict')?.why;
    out.push(`- **Verdict:** ${verdict}${why ? ` — ${why}` : ''}`);
    out.push('');
    out.push(
      '_Generated by the run itself (`web-tests/reporters/result-file.ts`). Observed values are',
      'what the run read off the screen; anything it did not read reads `NOT OBSERVED`._',
      '',
    );

    // ---- assertions
    out.push('## Assertions', '');
    const checks = pick('check');
    out.push('| # | Expected | Observed | Result |', '|---|---|---|---|');
    let i = 1;
    if (checks.length) {
      for (const c of checks) {
        // 'recorded' says the value was read and nothing asserted it - neither a
        // pass nor a failure, and not counted as either by
        // scripts/build-dashboard.ps1.
        const result =
          c.result === 'not-observed'
            ? 'NOT OBSERVED'
            : c.result === 'recorded'
              ? 'recorded — not asserted'
              : c.result;
        out.push(
          `| ${i++} | ${cell(c.description)} — \`${cell(c.expected)}\` | ${
            c.observed === null ? 'NOT OBSERVED' : `\`${cell(c.observed)}\``
          } | ${result} |`,
        );
      }
    }
    // Assertions Playwright saw but the spec did not record a value for. Listed
    // after the recorded ones so a reader sees the substantiated rows first.
    for (const t of run.tests) {
      for (const x of this.expects.get(t.test.id) ?? []) {
        if (checks.some((c) => c.description === x.title)) continue;
        out.push(
          `| ${i++} | ${cell(x.title)} | ${
            x.error ? cell(firstLine(x.error)) : 'NOT OBSERVED'
          } | ${x.error ? 'fail' : 'pass'} |`,
        );
      }
    }
    if (i === 1) out.push('| — | no assertion was recorded by this run | NOT OBSERVED | NOT OBSERVED |');
    out.push('');
    out.push('A value that could not be read is `NOT OBSERVED`. Never a plausible guess.', '');

    // ---- steps
    out.push('## Steps executed', '');
    out.push('| # | Step | Outcome |', '|---|---|---|');
    const steps = pick('step');
    let s = 1;
    if (steps.length) {
      for (const st of steps) {
        out.push(
          `| ${s++} | ${cell(st.description)} | ${st.outcome}${st.detail ? ` — ${cell(st.detail)}` : ''} |`,
        );
      }
    } else {
      // Fallback: the tests themselves are the steps. Coarse, but true.
      for (const t of run.tests) {
        const err = t.result.error?.message ? ` — ${cell(firstLine(t.result.error.message))}` : '';
        out.push(`| ${s++} | ${cell(t.test.title)} | ${t.result.status}${err} |`);
      }
      out.push('');
      out.push(
        '_This spec does not record its steps yet, so the table above is Playwright\'s view_',
        '_of it. See `docs/unattended-runs.md` § Instrumenting a spec._',
      );
    }
    out.push('');

    // ---- deviations
    out.push('## Deviations', '');
    const deviations = pick('deviation');
    const errors = run.tests
      .filter((t) => t.result.error?.message)
      .map((t) => `${t.test.title}: ${firstLine(t.result.error!.message!)}`);
    if (deviations.length || errors.length) {
      for (const d of deviations) out.push(`- ${d.text}`);
      for (const e of errors) out.push(`- ${e}`);
    } else {
      // Exactly "None." and nothing else. scripts/check-suite.ps1 reads this
      // section to decide whether a PASS run counts toward the two clean runs a
      // case needs before it can be frozen, and it recognises that one spelling
      // - any elaboration here reads to it as a recorded deviation and quietly
      // stops every clean run from ever counting.
      out.push('None.');
    }
    out.push('');

    // ---- documents
    out.push('## Documents created', '');
    const docs = mergeDocuments(pick('document'));
    if (docs.length) {
      out.push('| Type | Number | Left in place? |', '|---|---|---|');
      for (const d of docs) {
        out.push(
          `| ${cell(d.docType)}${d.companyCode ? `, co.code ${d.companyCode}` : ''} | ${
            d.number ? `**${cell(d.number)}**` : 'none — no number was returned'
          } | ${d.leftInPlace ? 'yes' : 'no'}${
            d.lifecycle.length ? ` — ${d.lifecycle.join(', ')}` : ''
          }${d.note ? ` (${cell(d.note)})` : ''} |`,
        );
      }
      out.push('');
      // The exact machine-readable form scripts/build-dashboard.ps1 prefers
      // (tier 2), so the dashboard never has to guess at the prose above.
      out.push('```objects');
      out.push(`attempted: ${docs.length}`);
      for (const d of docs) {
        out.push(
          [
            d.docType,
            d.number ?? 'none',
            d.companyCode ?? '',
            d.lifecycle.join(' '),
            d.leftInPlace ? 'yes' : 'no',
            d.note ?? '',
          ].join(' | '),
        );
      }
      out.push('```');
    } else {
      out.push('None recorded by this run.');
    }
    out.push('');

    // ---- evidence
    out.push('## Evidence', '');
    const shots = pick('evidence');
    if (shots.length) {
      out.push('| File | Shows |', '|---|---|');
      const seen = new Set<string>();
      for (const s2 of shots) {
        if (seen.has(s2.file)) continue;
        seen.add(s2.file);
        out.push(`| \`${cell(s2.file)}\` | ${cell(s2.shows)} |`);
      }
    } else {
      out.push('None recorded by this run.');
    }
    out.push('');

    return out.join('\n');
  }
}

function firstLine(text: string): string {
  return text.split('\n')[0].replace(/\x1b\[[0-9;]*m/g, '').trim();
}

type Doc = {
  docType: string;
  number: string | null;
  companyCode?: string;
  lifecycle: string[];
  leftInPlace: boolean;
  note?: string;
};

/**
 * One row per document, however many times the run touched it.
 *
 * A deal is created, then settled, then posted — three entries about one
 * object. Reported as three rows, the dashboard would count three documents
 * where the run wrote one, and the count of what is sitting in the client is
 * the number people act on.
 */
function mergeDocuments(entries: Entry[]): Doc[] {
  const byNumber = new Map<string, Doc>();
  const anonymous: Doc[] = [];

  for (const e of entries) {
    const doc: Doc = {
      docType: e.docType ?? '',
      number: e.number ?? null,
      companyCode: e.companyCode,
      lifecycle: Array.isArray(e.lifecycle) ? e.lifecycle : [],
      leftInPlace: e.leftInPlace !== false,
      note: e.note,
    };
    if (!doc.number) {
      anonymous.push(doc);
      continue;
    }
    const existing = byNumber.get(doc.number);
    if (!existing) {
      byNumber.set(doc.number, doc);
      continue;
    }
    if (!existing.docType && doc.docType) existing.docType = doc.docType;
    if (!existing.companyCode && doc.companyCode) existing.companyCode = doc.companyCode;
    if (doc.note) existing.note = existing.note ? `${existing.note}; ${doc.note}` : doc.note;
    existing.leftInPlace = existing.leftInPlace && doc.leftInPlace;
    for (const stage of doc.lifecycle) {
      if (!existing.lifecycle.includes(stage)) existing.lifecycle.push(stage);
    }
  }

  return [...byNumber.values(), ...anonymous];
}
