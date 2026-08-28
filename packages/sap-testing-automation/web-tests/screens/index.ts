/**
 * Screen models — one declarative description per SAP screen this suite drives.
 *
 * A model is the single place a screen's handles live: field titles, the `nth`
 * that disambiguates a repeated title, the positional ids of buttons and
 * checkboxes. Specs address controls by *name* (`tbb1.postingDate`), never by
 * literal title or id, so a screen that changes after a transport is repaired in
 * one JSON file instead of in every spec that touched it.
 *
 * Two things fall out of the models being data rather than code:
 *  - `usedBy` names the test cases each screen carries, so drift maps to the
 *    cases at risk (see tests/screen-model-check.spec.ts);
 *  - `expectDuplicates` records how many inputs legitimately share a title, so a
 *    new one appearing is caught instead of silently redefining an `nth`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import type { Page } from '@playwright-sap/test';
import {
  setField, setFieldVerified, readField, selectDropdown,
  readCheckbox, setCheckbox, clickButton, findSaveButton, openTransaction,
} from '../webgui';
import { sapSystem } from '../sap-system';

const here = dirname(fileURLToPath(import.meta.url));

export type InputControl = {
  kind: 'input';
  title: string;
  nth?: number;
  /** How many inputs legitimately share this title. A different count is drift. */
  expectDuplicates?: number;
  /** Type it back-verified: an identifier or date where a dropped keystroke changes meaning. */
  verify?: boolean;
  /** SAP rewrites the value on the round trip, so never string-compare it. */
  reformats?: boolean;
  /** Absent on some variants of the screen — its absence is not drift. */
  optional?: boolean;
  note?: string;
};

export type DropdownControl = {
  kind: 'dropdown';
  title: string;
  nth?: number;
  expectDuplicates?: number;
  optional?: boolean;
  options?: string[];
  note?: string;
};

export type CheckboxControl = { kind: 'checkbox'; id: string; optional?: boolean; note?: string };

export type ButtonControl = {
  kind: 'button';
  id?: string;
  /** 'save' resolves at run time by the exact (Ctrl+S) tooltip instead of by id. */
  resolve?: 'save';
  fallbackId?: string;
  optional?: boolean;
  note?: string;
};

export type Control = InputControl | DropdownControl | CheckboxControl | ButtonControl;

/**
 * How to get to a screen no t-code opens directly: fill the prior screen from a
 * dataset row and press Enter.
 */
export type Reach = { from: string; dataset: string; row: string; note?: string };

export type ScreenModel = {
  id: string;
  transaction: string;
  dynpro: string;
  description: string;
  /** Test case ids that depend on this screen. Drives the change-impact report. */
  usedBy: string[];
  /** Human-readable capture target, e.g. "DS4 / 100". Not unique - see capturedOnSystem. */
  capturedOn: string;
  /**
   * Registry id of the system this model was discovered on, e.g. `DS4_100_NIIF`.
   *
   * `capturedOn` cannot carry this: two landscapes in config/sap-systems.json
   * share SYSID `DS4` and client `100`, so "DS4 / 100" does not identify which
   * one a model came from. Element ids and screen structure vary with
   * customising, so a model captured on one landscape is not portable to
   * another - `assertModelSystem` uses this field to say so out loud rather
   * than letting a mismatched handle fail later as what looks like a product
   * bug. Absent means "not yet declared" and is allowed.
   */
  capturedOnSystem?: string;
  capturedAt: string;
  /** Field title that proves the screen has finished rendering. */
  anchor: string;
  reach?: Reach;
  controls: Record<string, Control>;
};

function load(): Record<string, ScreenModel> {
  const out: Record<string, ScreenModel> = {};
  for (const file of readdirSync(here).filter((f) => f.endsWith('.json'))) {
    const model = JSON.parse(readFileSync(join(here, file), 'utf8')) as ScreenModel;
    if (model.id !== file.replace(/\.json$/, '')) {
      throw new Error(`screen model ${file}: id '${model.id}' does not match its filename`);
    }
    out[model.id] = model;
  }
  return out;
}

export const screens = load();

export function screen(id: string): ScreenModel {
  const m = screens[id];
  if (!m) {
    throw new Error(`no screen model '${id}'. Known: ${Object.keys(screens).join(', ')}`);
  }
  return m;
}

/** Look a control up by name, failing loudly rather than returning undefined. */
export function control(model: ScreenModel, name: string): Control {
  const c = model.controls[name];
  if (!c) {
    throw new Error(
      `screen '${model.id}' has no control '${name}'. Known: ${Object.keys(model.controls).join(', ')}`,
    );
  }
  return c;
}

function asField(model: ScreenModel, name: string): InputControl | DropdownControl {
  const c = control(model, name);
  if (c.kind !== 'input' && c.kind !== 'dropdown') {
    throw new Error(`control '${model.id}.${name}' is a ${c.kind}, not a field`);
  }
  return c;
}

/** Open the model's transaction and wait for its anchor field to render. */
/**
 * Refuse to drive a screen through a model captured on a different landscape.
 *
 * Element ids and screen structure follow customising, so a model discovered
 * on one system is not portable to another - docs/suite-design.md says so in
 * prose, and this is that rule with teeth. The failure it prevents is the
 * expensive kind: a drifted or absent handle surfaces as "not found" midway
 * through a flow, which reads like a product bug and costs a debugging round
 * trip before anyone checks which system the model came from.
 */
export function assertModelSystem(model: ScreenModel) {
  if (model.capturedOnSystem && model.capturedOnSystem !== sapSystem.id) {
    throw new Error(
      `screen model '${model.id}' was captured on '${model.capturedOnSystem}' but this ` +
        `run targets '${sapSystem.id}'. Element ids and screen structure vary with ` +
        `customising, so this model is not portable - rediscover the screen on ` +
        `'${sapSystem.id}' and write a model for it (see docs/suite-design.md, ` +
        `"Screen models are not portable between systems").`,
    );
  }
}

export async function openScreen(page: Page, model: ScreenModel, timeout = 30_000) {
  assertModelSystem(model);
  await openTransaction(page, model.transaction);
  await page
    .locator(`input[title="${model.anchor}"]`)
    .first()
    .waitFor({ state: 'visible', timeout });
}

/** Wait for a screen to be on display without navigating to it (post-Enter, post-click). */
export async function awaitScreen(page: Page, model: ScreenModel, timeout = 30_000) {
  await page
    .locator(`input[title="${model.anchor}"]`)
    .first()
    .waitFor({ state: 'visible', timeout });
}

/**
 * Write a field, using the model's own `verify` flag to decide whether the value
 * is typed back-verified. A control marked `reformats` is never verified — SAP
 * rewrites it, so the read-back would never match what was typed.
 */
export async function mSet(page: Page, model: ScreenModel, name: string, value: string) {
  const c = asField(model, name);
  if (c.kind === 'dropdown') {
    return selectDropdown(page, c.title, value, c.nth ?? 0);
  }
  if (c.verify) {
    await setFieldVerified(page, c.title, value, c.nth ?? 0);
    return value;
  }
  await setField(page, c.title, value, c.nth ?? 0);
  return value;
}

export async function mRead(page: Page, model: ScreenModel, name: string): Promise<string> {
  const c = asField(model, name);
  return readField(page, c.title, c.nth ?? 0);
}

/** Read a field that may legitimately be absent. Returns null instead of throwing. */
export async function mReadOptional(
  page: Page,
  model: ScreenModel,
  name: string,
): Promise<string | null> {
  return mRead(page, model, name).catch(() => null);
}

export async function mReadCheckbox(page: Page, model: ScreenModel, name: string) {
  const c = control(model, name);
  if (c.kind !== 'checkbox') throw new Error(`control '${model.id}.${name}' is not a checkbox`);
  return readCheckbox(page, c.id);
}

export async function mSetCheckbox(
  page: Page,
  model: ScreenModel,
  name: string,
  want: boolean,
  log?: (s: string) => void,
) {
  const c = control(model, name);
  if (c.kind !== 'checkbox') throw new Error(`control '${model.id}.${name}' is not a checkbox`);
  return setCheckbox(page, c.id, want, log);
}

/**
 * Resolve a button to a live id. `resolve: 'save'` finds it by its exact (Ctrl+S)
 * tooltip and only falls back to the recorded id if that finds nothing.
 */
export async function mButtonId(page: Page, model: ScreenModel, name: string): Promise<string> {
  const c = control(model, name);
  if (c.kind !== 'button') throw new Error(`control '${model.id}.${name}' is not a button`);
  if (c.resolve === 'save') {
    const found = await findSaveButton(page);
    if (found) return found;
    if (c.fallbackId) return c.fallbackId;
    throw new Error(`could not resolve the Save button on '${model.id}'`);
  }
  if (!c.id) throw new Error(`button '${model.id}.${name}' has neither an id nor a resolver`);
  return c.id;
}

export async function mClick(
  page: Page,
  model: ScreenModel,
  name: string,
  maxMs = 25_000,
): Promise<string> {
  const id = await mButtonId(page, model, name);
  await clickButton(page, id, maxMs);
  return id;
}

/** Read every field the model declares, in one pass. Absent fields read as null. */
export async function mReadAll(
  page: Page,
  model: ScreenModel,
  names: string[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const n of names) out[n] = await mReadOptional(page, model, n);
  return out;
}

/**
 * What the live screen actually has, for every control the model declares.
 *
 * Read-only, and the whole basis of the change-impact check: for each control it
 * reports whether it was found, how many inputs share its title (against
 * `expectDuplicates`), and whether the `nth` the model relies on exists at all.
 */
export type ControlProbe = {
  name: string;
  kind: Control['kind'];
  handle: string;
  found: boolean;
  optional: boolean;
  /** Inputs sharing this title. Only meaningful for input/dropdown controls. */
  matches?: number;
  expectedMatches?: number;
  /** The model asks for this index; does it exist? */
  nth?: number;
  detail?: string;
};

export async function inspectScreen(page: Page, model: ScreenModel): Promise<ControlProbe[]> {
  const probes: ControlProbe[] = [];

  for (const [name, c] of Object.entries(model.controls)) {
    const optional = 'optional' in c ? !!c.optional : false;

    if (c.kind === 'input' || c.kind === 'dropdown') {
      const matches = await page.locator(`input[title="${c.title}"]`).count();
      const nth = c.nth ?? 0;
      probes.push({
        name,
        kind: c.kind,
        handle: `title="${c.title}"${c.nth ? `[${c.nth}]` : ''}`,
        found: matches > nth,
        optional,
        matches,
        expectedMatches: c.expectDuplicates ?? 1,
        nth,
      });
      continue;
    }

    if (c.kind === 'checkbox') {
      const state = await readCheckbox(page, c.id);
      probes.push({
        name, kind: c.kind, handle: c.id, found: state !== null, optional,
        detail: state === null ? undefined : `checked=${state}`,
      });
      continue;
    }

    if (c.resolve === 'save') {
      const id = await findSaveButton(page);
      probes.push({
        name, kind: c.kind, handle: 'tooltip (Ctrl+S)', found: id !== null, optional,
        detail: id ? `resolved to ${id}` : undefined,
      });
      continue;
    }

    const present = c.id ? await page.locator(`[id="${c.id}"]`).count() : 0;
    probes.push({ name, kind: c.kind, handle: c.id ?? '(no id)', found: present > 0, optional });
  }

  return probes;
}

/**
 * Every input title on the live screen, with how many inputs carry it.
 *
 * The other half of the drift check: a control the model *does not* claim. A new
 * mandatory field arriving with a transport passes every existing assertion and
 * then refuses the save, which reads like a data problem and is not one.
 */
export async function screenInputTitles(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const counts: Record<string, number> = {};
    for (const el of Array.from(document.querySelectorAll('input'))) {
      const input = el as HTMLInputElement;
      const box = input.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (input.type === 'password' || input.type === 'hidden') continue;
      const title = (input.title ?? '').trim();
      if (!title) continue;
      counts[title] = (counts[title] ?? 0) + 1;
    }
    return counts;
  });
}

/** Repo root, for writing reports next to the other artifacts. */
export const repoRoot = resolve(here, '..', '..');
