/**
 * Suite membership — which specs are a regression answer and which are not.
 *
 * The model as test driver is excellent for exploring a transaction and
 * non-deterministic for a suite you run every sprint. Those are two different
 * jobs, and mixing them means a red "regression" run that is really just a probe
 * spec finding a screen it had not seen before. ../config/suites.json draws the
 * line; this turns it into Playwright projects, so `--project=regression` is
 * exactly the case-backed set and nothing else.
 *
 * Loading is strict on purpose. Every spec on disk must be classified by exactly
 * one suite:
 *  - unclassified would mean the spec belongs to no project and silently never
 *    runs again — the worst outcome available here;
 *  - claimed twice would mean it runs twice against a live client, and for a case
 *    that writes, that is two deals where one was authorised.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const testsDir = resolve(here, 'tests');
const configPath = resolve(here, '..', 'config', 'suites.json');

type SuiteConfig = { description: string; specs?: string[]; patterns?: string[] };
type SuitesFile = { description: string; suites: Record<string, SuiteConfig> };

/** Only `*` is supported — these are filenames, not paths. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/\\\\]*');
  return new RegExp(`^${escaped}$`);
}

export type Suite = { name: string; description: string; specs: string[] };

function build(): Suite[] {
  const config: SuitesFile = JSON.parse(readFileSync(configPath, 'utf8'));
  const onDisk = readdirSync(testsDir).filter((f) => f.endsWith('.spec.ts')).sort();

  const owner = new Map<string, string>();
  const suites: Suite[] = [];

  for (const [name, suite] of Object.entries(config.suites)) {
    const matched = new Set<string>();

    for (const spec of suite.specs ?? []) {
      if (!onDisk.includes(spec)) {
        throw new Error(
          `config/suites.json: suite '${name}' lists '${spec}', which is not in web-tests/tests/`,
        );
      }
      matched.add(spec);
    }
    for (const pattern of suite.patterns ?? []) {
      const re = globToRegExp(pattern);
      const hits = onDisk.filter((f) => re.test(f));
      if (hits.length === 0) {
        throw new Error(
          `config/suites.json: suite '${name}' pattern '${pattern}' matches no spec in web-tests/tests/`,
        );
      }
      for (const h of hits) matched.add(h);
    }

    for (const spec of matched) {
      const already = owner.get(spec);
      if (already) {
        throw new Error(
          `config/suites.json: '${spec}' is claimed by both '${already}' and '${name}'. ` +
            `A spec that runs in two projects runs twice against the live client.`,
        );
      }
      owner.set(spec, name);
    }

    suites.push({ name, description: suite.description, specs: [...matched].sort() });
  }

  const unclassified = onDisk.filter((f) => !owner.has(f));
  if (unclassified.length) {
    throw new Error(
      `config/suites.json does not classify: ${unclassified.join(', ')}.\n` +
        `Add each to a suite — 'exploratory' is the right home for a new probe or discovery spec. ` +
        `An unclassified spec belongs to no project and would never run.`,
    );
  }

  return suites;
}

export const suites = build();

export function suite(name: string): Suite {
  const s = suites.find((x) => x.name === name);
  if (!s) throw new Error(`no suite '${name}'. Known: ${suites.map((x) => x.name).join(', ')}`);
  return s;
}

/** Globs for a suite's specs, in the form Playwright's `testMatch` expects. */
export function testMatchFor(name: string): string[] {
  return suite(name).specs.map((s) => `**/${s}`);
}
