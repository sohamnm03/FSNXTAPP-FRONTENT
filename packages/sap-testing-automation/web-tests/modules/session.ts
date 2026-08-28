/**
 * Session-level business components — the steps every case repeats before it is
 * allowed to touch anything.
 */
import { expect, type Page } from '@playwright-sap/test';
import { screenInfo, writeArtifact } from '../webgui';
import { journal } from '../journal';

/** Collects a run log that is written whole, so a green run emits nothing to read. */
export type Logger = {
  note: (s: string) => void;
  lines: string[];
  /** Write the log to results/web/<name>. */
  flush: (name: string) => void;
};

export function makeLogger(prefix = ''): Logger {
  const lines: string[] = [];
  return {
    lines,
    note(s: string) {
      lines.push(s);
      console.log(prefix ? `[${prefix}] ${s}` : s);
    },
    flush(name: string) {
      writeArtifact(name, lines.join('\n'));
    },
  };
}

/**
 * CLAUDE.md non-negotiable #1, as a step.
 *
 * Re-checked on every transaction rather than once per run: a flow spans three
 * t-codes, and the WebGUI info area is the only thing that can tell DS4 from the
 * two production entries this machine can also reach.
 */
export async function assertDevSystem(page: Page, where: string, note: (s: string) => void) {
  const info = await screenInfo(page);
  note(`SYSTEM @${where}: ${JSON.stringify(info)}`);

  const observed = {
    system: String(info.system ?? ''),
    client: String(info.client ?? ''),
    user: info.user ? String(info.user) : undefined,
  };

  // The assertions run BEFORE the journal entry, and the entry carries whether
  // they held.
  //
  // Recording first was wrong in the one direction that matters: a run that read
  // the wrong system - or read nothing at all - still emitted a `system` entry,
  // and `reporters/result-file.ts` turns the presence of one into
  // "confirmed via screenInfo: yes". So the report claimed rule 1 was satisfied
  // on exactly the run where it was not. The values are still recorded when the
  // check fails, because what the screen actually said is evidence; what changes
  // is that `confirmed` now states the verdict instead of the reader inferring
  // it from the row existing.
  try {
    expect(info.system, 'must be DS4').toContain('DS4');
    expect(info.client, 'must be client 100').toContain('100');
  } catch (e) {
    journal.systemConfirmed(where, { ...observed, confirmed: false });
    throw e;
  }

  journal.systemConfirmed(where, { ...observed, confirmed: true });
  return info;
}

/**
 * Every visible input value on the screen.
 *
 * `bodyText` returns the Dynpro *labels* only — field contents live in input
 * elements and never appear in innerText — so a deal number can never be
 * asserted against body text. This is what to check a field value against.
 */
export async function inputValues(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('input'))
      .map((i) => ((i as HTMLInputElement).value ?? '').trim())
      .filter(Boolean),
  );
}

/**
 * The refusal line SAP puts in the message area, if there is one.
 *
 * A save blocked by a Dynpro error otherwise shows up only as a missing document
 * number, which reads like a parsing bug and is not one.
 */
export function refusalLine(screenText: string): string {
  return screenText.split('\n').map((l) => l.trim()).find((l) => /^Error:/i.test(l)) ?? '';
}

/**
 * What SAP calls the object it just created, in SAP's own words.
 *
 * The confirmation reads "Interest rate instrument 160254 in company code 1000
 * is created" — so the object's type and its company code are both stated by
 * the system, and neither has to be inferred from the product type the spec
 * asked for. That distinction matters for the run file: a product type is what
 * was requested, and this is what was created.
 *
 * Returns null when no confirmation line is present, because a run that cannot
 * see one has not been told what it made.
 */
export function documentDescriptor(
  screenText: string,
  statusText: string,
): { docType: string; companyCode: string } | null {
  const source = `${statusText}\n${screenText}`;
  const m = source.match(
    /([A-Za-z][A-Za-z .\/-]{2,60}?)\s+(\d{5,12})\s+in company code\s+(\d{4})/i,
  );
  if (!m) return null;
  return { docType: m[1].trim(), companyCode: m[3] };
}

/** The document number SAP names in its own confirmation. Never guessed. */
export function documentNumber(screenText: string, statusText: string, fieldValue = ''): string {
  const msgLine =
    screenText.split('\n').map((l) => l.trim())
      .find((l) => /created|angelegt|\bsaved\b/i.test(l)) ?? '';
  return (
    msgLine.match(/\b(\d{5,12})\b/)?.[1] ??
    statusText.match(/\b(\d{5,12})\b/)?.[1] ??
    (/^\d{5,12}$/.test(fieldValue.trim()) ? fieldValue.trim() : '')
  );
}
