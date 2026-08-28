import { test, expect } from '../fixtures';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pressKey } from '../webgui';
import { loadDataset } from '../dataset';
import { assertDevSystem, makeLogger } from '../modules/session';
import {
  screens, screen, openScreen, awaitScreen, mSet, inspectScreen, screenInputTitles,
  repoRoot, type ScreenModel, type ControlProbe,
} from '../screens';

/**
 * Change-impact check — read-only. Nothing here writes to the database.
 *
 * Every handle this suite relies on is declared in web-tests/screens/*.json. This
 * spec opens each of those screens on the live system and compares what is
 * actually there against what the model says, then names the test cases that
 * would break. Run it after a transport lands, before trusting a green suite.
 *
 * It exists because the failure it catches is silent. An element id that has
 * moved fails as "not found", which reads like a product bug. Worse, a *second*
 * input acquiring an existing title silently redefines an `nth`: TBB1 already has
 * two inputs titled "Posting Date in the Document", and picking the wrong one
 * posts under today's date while the screen looks correct. A count is the only
 * thing that catches that, so the models record the count and this checks it.
 *
 * Three kinds of finding:
 *   BREAKING   — a required control is gone, or a title's ambiguity changed.
 *                A case using it will fail, or worse, quietly do the wrong thing.
 *   INFO       — a control on screen that no model claims. Often nothing; a new
 *                mandatory field is how a save starts being refused.
 *   OK         — found where the model said, with the ambiguity the model expects.
 */

type Finding = {
  screen: string;
  control: string;
  handle: string;
  severity: 'BREAKING' | 'INFO';
  detail: string;
};

const findings: Finding[] = [];
const checked: { model: ScreenModel; probes: ControlProbe[]; unmodelled: string[] }[] = [];
const log = makeLogger('model-check');

/**
 * Reach a screen no t-code opens directly: fill the prior screen from its dataset
 * row and press Enter.
 *
 * The mapping is by name — a control called `productType` on the prior screen is
 * filled from the row's `productType`. Only controls the row actually has a value
 * for are touched, so this cannot invent input.
 */
async function reachScreen(page: Parameters<typeof openScreen>[0], model: ScreenModel) {
  if (!model.reach) {
    await openScreen(page, model);
    await assertDevSystem(page, model.transaction, log.note);
    return;
  }

  const from = screen(model.reach.from);
  const ds = loadDataset(model.reach.dataset);
  const row = ds.rows.find((r) => r.id === model.reach!.row);
  if (!row) {
    throw new Error(
      `screen '${model.id}' is reached via dataset row '${model.reach.dataset}/${model.reach.row}', which does not exist`,
    );
  }

  await openScreen(page, from);
  await assertDevSystem(page, from.transaction, log.note);

  const values = row as unknown as Record<string, string | undefined>;
  for (const name of Object.keys(from.controls)) {
    const value = values[name];
    if (typeof value === 'string' && value !== '') {
      await mSet(page, from, name, value);
    }
  }
  await pressKey(page, 'Enter');
  await awaitScreen(page, model);
}

test.afterAll(() => {
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const breaking = findings.filter((f) => f.severity === 'BREAKING');

  const atRisk = new Set<string>();
  for (const f of breaking) {
    for (const c of screen(f.screen).usedBy) atRisk.add(c);
  }

  const lines: string[] = [
    '# Screen model drift',
    '',
    `- **Generated:** ${generatedAt}`,
    `- **Screens checked:** ${checked.length} of ${Object.keys(screens).length}`,
    `- **Breaking findings:** ${breaking.length}`,
    `- **Cases at risk:** ${atRisk.size ? [...atRisk].sort().join(', ') : 'none'}`,
    '',
  ];

  if (breaking.length === 0) {
    lines.push('Every declared handle is where the model says it is. No case is at risk.', '');
  }

  for (const { model, probes, unmodelled } of checked) {
    const mine = findings.filter((f) => f.screen === model.id);
    const status = mine.some((f) => f.severity === 'BREAKING') ? 'DRIFT' : 'OK';

    lines.push(
      `## ${model.id} — ${status}`,
      '',
      `- **Transaction / screen:** \`${model.transaction}\` — \`${model.dynpro}\``,
      `- **Cases using it:** ${model.usedBy.join(', ')}`,
      `- **Model captured:** ${model.capturedAt} on ${model.capturedOn}`,
      '',
      '| Control | Handle | Found | Ambiguity | Verdict |',
      '|---|---|---|---|---|',
    );

    for (const p of probes) {
      const ambiguity =
        p.matches === undefined
          ? '—'
          : `${p.matches} / ${p.expectedMatches} expected`;
      const verdict = !p.found
        ? p.optional ? 'absent (optional)' : '**MISSING**'
        : p.matches !== undefined && p.matches !== p.expectedMatches
          ? '**AMBIGUITY CHANGED**'
          : 'ok';
      lines.push(`| \`${p.name}\` | \`${p.handle}\` | ${p.found ? 'yes' : 'no'} | ${ambiguity} | ${verdict} |`);
    }
    lines.push('');

    if (unmodelled.length) {
      lines.push(
        `**On screen but not in the model** (${unmodelled.length}) — check whether any is now mandatory:`,
        '',
        ...unmodelled.map((t) => `- \`${t}\``),
        '',
      );
    }
  }

  if (breaking.length) {
    lines.push(
      '## What to do',
      '',
      'Rediscover the screen, update its model in `web-tests/screens/`, then re-run the',
      'cases named above. Do not patch a spec around a drifted handle — the model is what',
      'every case shares, and a spec-local workaround puts the next case back where this',
      'one started.',
      '',
      '| Screen | Control | Handle | Finding |',
      '|---|---|---|---|',
      ...breaking.map((f) => `| ${f.screen} | \`${f.control}\` | \`${f.handle}\` | ${f.detail} |`),
      '',
    );
  }

  mkdirSync(resolve(repoRoot, 'results', 'web'), { recursive: true });
  writeFileSync(resolve(repoRoot, 'results', 'web', 'screen-drift.md'), lines.join('\n'), 'utf8');
  log.flush('screen-model-check-log.txt');

  console.log(
    `\nscreen model check: ${checked.length} screens, ${breaking.length} breaking findings` +
      (atRisk.size ? `, cases at risk: ${[...atRisk].sort().join(', ')}` : '') +
      '\nreport: results/web/screen-drift.md',
  );
});

for (const model of Object.values(screens)) {
  test(`screen model ${model.id} (${model.transaction})`, async ({ sapPage }) => {
    test.setTimeout(240_000);

    await reachScreen(sapPage, model);

    const probes = await inspectScreen(sapPage, model);
    const onScreen = await screenInputTitles(sapPage);

    const claimed = new Set(
      Object.values(model.controls)
        .filter((c) => c.kind === 'input' || c.kind === 'dropdown')
        .map((c) => (c as { title: string }).title),
    );
    const unmodelled = Object.keys(onScreen).filter((t) => !claimed.has(t)).sort();

    checked.push({ model, probes, unmodelled });

    for (const p of probes) {
      if (!p.found && !p.optional) {
        findings.push({
          screen: model.id, control: p.name, handle: p.handle, severity: 'BREAKING',
          detail: 'declared control is not on the screen',
        });
        log.note(`BREAKING ${model.id}.${p.name}: not found (${p.handle})`);
        continue;
      }
      if (p.found && p.matches !== undefined && p.matches !== p.expectedMatches) {
        findings.push({
          screen: model.id, control: p.name, handle: p.handle, severity: 'BREAKING',
          detail: `${p.matches} inputs carry this title, model expects ${p.expectedMatches} — nth ${p.nth} may now address a different field`,
        });
        log.note(
          `BREAKING ${model.id}.${p.name}: ${p.matches} matches, expected ${p.expectedMatches}`,
        );
      }
    }

    for (const title of unmodelled) {
      findings.push({
        screen: model.id, control: '—', handle: `title="${title}"`, severity: 'INFO',
        detail: 'on screen, claimed by no control',
      });
    }

    const breaking = findings.filter((f) => f.screen === model.id && f.severity === 'BREAKING');
    expect(
      breaking,
      `screen '${model.id}' has drifted from its model; cases at risk: ${model.usedBy.join(', ')}. ` +
        `See results/web/screen-drift.md.\n` +
        breaking.map((f) => `  - ${f.control} (${f.handle}): ${f.detail}`).join('\n'),
    ).toEqual([]);
  });
}
