/**
 * Interpreter for a saved external case plan (web lane). The `.spec.ts` beside a
 * Markdown case carries only a validated JSON plan and loads this file; it holds
 * no model-written code. Targets: `fill`/`select`/`assert` use the field title as
 * `webgui.field()` does, `click`/`check` use the control id, `key` a key name.
 * No step is retried - a failed or uncertain write must never create a second deal.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from './fixtures';
import { sapSystem } from './sap-system';
import {
  openTransaction, setField, readField, pressKey, clickButton, selectDropdown,
  readCheckbox, setCheckbox, statusMessage, screenInfo, bodyText,
} from './webgui';

type Step = {
  action: string; label: string; target?: string; value?: string | boolean;
  write?: boolean; verifiesWrite?: boolean; expected?: string; match?: 'equals' | 'contains';
  source?: 'field' | 'status' | 'text' | 'value' | 'checked'; capture?: string;
  pattern?: string; documentType?: string; numeric?: boolean;
};
type Plan = { caseId: string; systemId: string; steps: Step[] };
type NumberMode = 'strict' | 'formatted' | 'numeric';

function canonicalNumber(input: string): string | null {
  const text = input.trim();
  if (!/^(?:[+-]?[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?-)$/.test(text)) return null;
  const negative = text.startsWith('-') || text.endsWith('-');
  const digits = text.replace(/^[+-]/, '').replace(/-$/, '').replace(/,/g, '');
  const [rawWhole, rawFraction = ''] = digits.split('.');
  const whole = rawWhole.replace(/^0+/, '') || '0';
  const fraction = rawFraction.replace(/0+$/, '');
  const value = fraction ? `${whole}.${fraction}` : whole;
  return negative && value !== '0' ? `-${value}` : value;
}

export function sameNumber(observed: string, expected: string, requireDisplayFormat = false): boolean {
  if (requireDisplayFormat && ![observed, expected].some((value) =>
    value.includes(',') || value.includes('.') || value.trim().endsWith('-') || value.trim().startsWith('+'))) return false;
  const actualNumber = canonicalNumber(observed);
  const expectedNumber = canonicalNumber(expected);
  return actualNumber !== null && actualNumber === expectedNumber;
}

export function defineExternalCase(plan: Plan) {
  test(`${plan.caseId} saved automation`, async ({ sapPage: page }) => {
    if (process.env.FSNXT_AUTOMATION_APPROVED !== '1') throw new Error('Select the Markdown case and confirm its writes in FSNXT before running.');
    if (plan.systemId !== process.env.SAP_SYSTEM_ID) throw new Error('Automation system mismatch');
    const output = resolve(process.env.FSNXT_EXTERNAL_RUN_DIR ?? '.', 'observations.json');
    const observed: any = { verdict: 'BLOCKED', systemConfirmed: false, writesVerified: false, session: '',
      summary: 'Started saved automation', assertions: [], steps: [], documents: [], deviations: [], evidence: [] };
    const flush = () => { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(observed, null, 2)); };
    const variables: Record<string, string> = {};
    let writes = 0, verified = 0;
    const subst = (v: unknown) => typeof v === 'string' ? v.replace(/\$\{([^}]+)\}/g, (_, k) => variables[k]) : v;
    const confirmSystem = async (where: string) => {
      const info = await screenInfo(page);
      if (!info.system.includes(sapSystem.systemId) || !info.client.includes(sapSystem.client)) {
        throw new Error(`Wrong SAP system at ${where}: ${info.system}/${info.client}`);
      }
      return info;
    };
    const read = async (s: Step): Promise<string> => {
      if (s.source === 'status') return statusMessage(page);
      if (s.source === 'text') return bodyText(page);
      if (s.source === 'checked') {
        const c = await readCheckbox(page, s.target!);
        if (c === null) throw new Error('Checkbox state could not be read');
        return String(c);
      }
      return readField(page, s.target!);
    };
    const assertion = (expected: string, actual: string, label: string, match = 'equals', numberMode: NumberMode = 'strict') => {
      let ok = match === 'contains' ? actual.includes(expected) : actual === expected;
      if (!ok && match === 'equals' && numberMode !== 'strict') {
        ok = sameNumber(actual, expected, numberMode === 'formatted');
      }
      observed.assertions.push({ expected: `${label}: ${expected}`, observed: actual, result: ok ? 'pass' : 'fail' });
      flush();
      if (!ok) throw new Error(`${label}: expected '${expected}', observed '${actual}'`);
    };
    flush();
    try {
      for (const step of plan.steps) {
        if (step.action === 'transaction') await openTransaction(page, String(subst(step.value)));
        const info = await confirmSystem(step.label);
        if (!observed.systemConfirmed) {
          observed.systemConfirmed = true;
          observed.session = `${info.system}/${info.client} user=${info.user}`;
        }
        const value = subst(step.value);
        const entry = { step: step.label, outcome: 'error', detail: 'Started; completion not yet verified' };
        observed.steps.push(entry);
        if (step.write) { writes++; observed.writesVerified = false; }
        flush();
        switch (step.action) {
          case 'transaction': break;
          case 'fill': await setField(page, step.target!, String(value)); assertion(String(value), await readField(page, step.target!), step.label, 'equals', 'formatted'); break;
          case 'click': await clickButton(page, step.target!); break;
          case 'key': await pressKey(page, String(value)); break;
          case 'select': await selectDropdown(page, step.target!, String(value)); break;
          case 'check': await setCheckbox(page, step.target!, value as boolean); break;
          case 'assert': {
            const actual = await read(step);
            const numericSource = step.source === 'field' || step.source === 'value';
            const numberMode: NumberMode = step.numeric === true ? 'numeric' : numericSource ? 'formatted' : 'strict';
            assertion(String(subst(step.expected)), actual, step.label, step.match, numberMode);
            if (step.capture) {
              const m = actual.match(new RegExp(step.pattern!));
              if (!m || !m[1]) throw new Error('The current SAP document/value could not be captured');
              variables[step.capture] = m[1];
              if (step.documentType) observed.documents.push({ type: step.documentType, number: m[1], leftInPlace: true });
            }
            if (step.verifiesWrite) verified++;
            break;
          }
          default: throw new Error(`Unsupported action: ${step.action}`);
        }
        entry.outcome = 'ok'; entry.detail = 'Executed and checked';
        flush();
      }
      if (!observed.assertions.length || writes !== verified) throw new Error('Missing assertions or unverified database writes');
      Object.assign(observed, { verdict: 'PASS', writesVerified: true, summary: 'Saved automation completed; all recorded assertions passed.' });
    } catch (error) {
      observed.verdict = 'FAIL'; observed.summary = String((error as Error).message);
      observed.deviations.push(observed.summary);
      flush();
      throw error;
    } finally { flush(); }
  });
}
