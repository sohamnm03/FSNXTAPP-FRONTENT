import { test, expect } from '../fixtures';
import {
  openTransaction, setField, setFieldVerified, readField, pressKey, clickButton,
  screenInfo, statusMessage, writeArtifact, handleKnownPopups, handleSaveDialogs,
  bodyText, findSaveButton, captureEvidence, selectDropdown, dumpScreen, settle, readPopup,
  readArtifact,
} from '../webgui';

/**
 * TC-003 - variant matrix for the 10B term loan.
 *
 * Ten deals, each differing from the TC-002 baseline in one dimension, so the
 * next person to write a term-loan case knows which combinations SAP accepts,
 * which it refuses, and what it demands instead. Every field and option used
 * here came from a read-only capture of the screen's own listboxes
 * (results/web/ftr-variant-fields.txt) - nothing is guessed.
 *
 * WRITES: one save per variant, ten at most. CREATE ONLY - no settlement, no
 * posting. Those mechanics are identical for every variant and already proven
 * by TC-002 (deals 200105-200109), so repeating them here would add twenty
 * commits and no information.
 *
 * A variant SAP refuses is a result, not a failure: the run records the exact
 * message and the fields the screen grew, and the test still passes. What would
 * be a failure is reporting a deal number that was never assigned.
 *
 *   npx playwright test tests/ftr-variant-matrix.spec.ts
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;

/** Unchanged across every variant - the TC-002 data. */
const BASE = {
  companyCode: '9800',
  productType: '10B',
  transactionType: '200',
  partner: '400000003',
  startDate: '01.01.2026',
  endDate: '31.12.2026',
  amount: '100000',
  interestRate: '10',
  contractDate: '01.01.2026',
};

/**
 * A variant is an ordered list of [dropdown title, option text].
 *
 * Order matters and is not incidental: Interest Category rebuilds the whole
 * interest block (condition type, calculation method, frequency), so it is
 * always applied first, before anything that lives inside that block.
 */
type Variant = {
  id: string;
  name: string;
  /** Expected to be refused without extra data - see the case file. */
  risky?: boolean;
  set: Array<[string, string]>;
  /**
   * Base fields to leave empty for this variant. Some settings are
   * incompatible with a value the baseline fills: "At Notice" is a term with no
   * fixed end, and SAP silently reverts the dropdown to "Fixed Term" if
   * "End of Term" already holds a date.
   */
  skip?: string[];
};

const VARIANTS: Variant[] = [
  { id: 'V01', name: 'Baseline - SAP defaults', set: [] },
  { id: 'V02', name: 'Interest monthly, month end', set: [['Frequency Indicator', 'On Last Day of Month']] },
  { id: 'V03', name: 'Interest monthly, term-start day', set: [['Frequency Indicator', 'Monthly']] },
  { id: 'V04', name: 'Interest monthly, first day of month', set: [['Frequency Indicator', 'On First Day of Month']] },
  { id: 'V05', name: 'Interest daily', set: [['Frequency Indicator', 'Daily']] },
  {
    id: 'V06',
    name: 'Day count act/360, End Included, Round Up',
    set: [
      ['Interest Calculation Method', 'act/360'],
      ['Calculation Period: Start Included vs. End Included', 'End Included'],
      ['Rounding Category', 'Round Up'],
    ],
  },
  {
    id: 'V07',
    name: 'Term at notice',
    risky: true,
    skip: ['End of Term'],
    set: [['Term Category', 'At Notice']],
  },
  { id: 'V08', name: 'Instalment repayment', risky: true, set: [['Repayment Method', 'Instalment Repayment']] },
  { id: 'V09', name: 'Annuity repayment', risky: true, set: [['Repayment Method', 'Annuity Repayment']] },
  { id: 'V10', name: 'Variable interest', risky: true, set: [['Interest Category', 'Variable']] },
];

type Outcome = {
  id: string;
  name: string;
  applied: string[];
  verdict: 'CREATED' | 'REFUSED' | 'ERROR';
  dealNo: string;
  message: string;
  newFields: string[];
  flowDates: string[];
};

const results: Outcome[] = [];

/** Titles of every visible input, for before/after comparison. */
async function inputTitles(page: Parameters<typeof screenInfo>[0]): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('input'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => (el as HTMLInputElement).title)
      .filter(Boolean),
  );
}

/**
 * Cash-flow dates, read off the Cash Flow tab, then back to Structure.
 *
 * The return to Structure is tidiness, not a fix. It was added on the theory
 * that saving from the Cash Flow tab was why the instalment and annuity
 * variants would not save - that theory is wrong, and is recorded here so it is
 * not retried: those two still refuse with the save issued from Structure, and
 * V01-V06 saved perfectly well from the Cash Flow tab before this line existed.
 */
async function cashFlowDates(page: Parameters<typeof screenInfo>[0]): Promise<string[]> {
  await clickButton(page, 'M0:46:2::0:6-title').catch(() => {});
  await settle(page, 10_000);
  const text = await bodyText(page);
  await clickButton(page, 'M0:46:2::0:0-title').catch(() => {});
  await settle(page, 10_000);
  const dates = Array.from(text.matchAll(/\b(\d{2}\.\d{2}\.\d{4})\b/g)).map((m) => m[1]);
  return [...new Set(dates)].sort(
    (a, b) =>
      new Date(a.split('.').reverse().join('-')).getTime() -
      new Date(b.split('.').reverse().join('-')).getTime(),
  );
}

test.afterAll(() => {
  /**
   * Merge with what earlier runs recorded, rather than replacing it.
   *
   * Each variant writes its own result file as it finishes, and the summary is
   * rebuilt from all of them. Without this, re-running a single variant with
   * `-g V08` rewrote the summary containing only V08 and threw away the other
   * nine - which is exactly what happened, and is a silent loss: the run that
   * destroys the record is green.
   */
  for (const r of results) {
    writeArtifact(`tc-003-variant-${r.id}.json`, JSON.stringify(r, null, 2));
  }

  const merged = new Map<string, Outcome>();
  for (const v of VARIANTS) {
    const prior = readArtifact(`tc-003-variant-${v.id}.json`);
    if (prior) {
      try {
        merged.set(v.id, JSON.parse(prior) as Outcome);
      } catch {
        /* unreadable - this run's own result, if any, still wins below */
      }
    }
  }
  for (const r of results) merged.set(r.id, r);
  const all = VARIANTS.map((v) => merged.get(v.id)).filter(Boolean) as Outcome[];

  const lines: string[] = [
    '# TC-003 variant matrix - results',
    '',
    '| Variant | Change | Verdict | Deal | Message |',
    '|---|---|---|---|---|',
  ];
  for (const r of all) {
    lines.push(
      `| ${r.id} | ${r.name} | ${r.verdict} | ${r.dealNo || '-'} | ${r.message.replace(/\|/g, '/').slice(0, 160)} |`,
    );
  }
  lines.push('', '## Detail', '');
  for (const r of all) {
    lines.push(`### ${r.id} - ${r.name}`);
    lines.push(`- verdict: **${r.verdict}**${r.dealNo ? `, deal **${r.dealNo}**` : ''}`);
    lines.push(`- applied: ${r.applied.length ? r.applied.join('; ') : '(none - defaults)'}`);
    if (r.newFields.length) lines.push(`- fields the screen grew: ${r.newFields.join(', ')}`);
    if (r.flowDates.length) {
      lines.push(`- cash flow (${r.flowDates.length} dates): ${r.flowDates.join(', ')}`);
    }
    if (r.message) lines.push(`- message: ${r.message}`);
    lines.push('');
  }
  writeArtifact('tc-003-variant-matrix.md', lines.join('\n'));
  console.log('\n===== VARIANT MATRIX =====');
  for (const r of results) {
    console.log(`${r.id} ${r.verdict.padEnd(8)} ${r.dealNo.padEnd(8)} ${r.name} :: ${r.message.slice(0, 110)}`);
  }
});

for (const v of VARIANTS) {
  test(`TC-003 ${v.id} - ${v.name}`, async ({ sapPage }) => {
    test.setTimeout(300_000);

    const out: Outcome = {
      id: v.id, name: v.name, applied: [], verdict: 'ERROR',
      dealNo: '', message: '', newFields: [], flowDates: [],
    };

    try {
      await openTransaction(sapPage, 'FTR_CREATE');
      const info = await screenInfo(sapPage);
      expect(info.system, 'must be DS4').toContain('DS4');
      expect(info.client, 'must be client 100').toContain('100');

      await setFieldVerified(sapPage, 'Company Code', BASE.companyCode);
      await setFieldVerified(sapPage, 'Product Type', BASE.productType);
      await setFieldVerified(sapPage, 'Financial Transaction Type', BASE.transactionType);
      await setFieldVerified(sapPage, 'Business Partner Number', BASE.partner);
      await pressKey(sapPage, 'Enter');

      await expect(sapPage.locator('input[title="Term Start"]')).toBeVisible({ timeout: 30_000 });

      const skip = new Set(v.skip ?? []);
      await setField(sapPage, 'Amount as Text Field', BASE.amount);
      await setFieldVerified(sapPage, 'Term Start', BASE.startDate);
      if (!skip.has('End of Term')) {
        await setFieldVerified(sapPage, 'End of Term', BASE.endDate);
      } else {
        out.applied.push('End of Term left empty (incompatible with this variant)');
      }
      await setFieldVerified(sapPage, 'Contract Date', BASE.contractDate);

      const before = await inputTitles(sapPage);

      // Apply the variant. A missing option is a finding, not a crash: the list
      // is read from the field's own listbox, so "not there" means this product
      // type genuinely does not offer it.
      for (const [title, option] of v.set) {
        const got = await selectDropdown(sapPage, title, option);
        out.applied.push(`${title} = ${got}`);
        await handleKnownPopups(sapPage, SAFE_POPUP, () => {});
      }

      // Rate last: Interest Category can rebuild the interest block and take
      // the nominal rate field with it.
      const hasRate = (await sapPage.locator('input[title="Nominal Interest Rate"]').count()) > 0;
      if (hasRate) {
        await setField(sapPage, 'Nominal Interest Rate', BASE.interestRate);
      } else {
        out.newFields.push('(no Nominal Interest Rate field on this variant)');
      }

      await pressKey(sapPage, 'Enter');
      const pop = await handleKnownPopups(sapPage, SAFE_POPUP, () => {});
      if (pop.blocked) {
        out.verdict = 'REFUSED';
        out.message = `dialog before save: ${pop.blocked}`;
        await captureEvidence(sapPage, `tc-003-${v.id}-blocked-dialog`);
        await dumpScreen(sapPage, `tc-003-${v.id}-blocked`, { full: true }).catch(() => {});
        return;
      }

      const after = await inputTitles(sapPage);
      const beforeSet = new Set(before);
      out.newFields.push(...[...new Set(after.filter((t) => !beforeSet.has(t)))]);

      out.flowDates = await cashFlowDates(sapPage).catch(() => []);
      await captureEvidence(sapPage, `tc-003-${v.id}-before-save`);

      // A Dynpro error refuses the save outright; detect it before clicking.
      const preText = await bodyText(sapPage);
      const preErr = preText.split('\n').map((l) => l.trim()).find((l) => /^Error:/i.test(l));
      if (preErr) {
        out.verdict = 'REFUSED';
        out.message = preErr;
        await dumpScreen(sapPage, `tc-003-${v.id}-refused`, { full: true }).catch(() => {});
        return;
      }

      // Everything above this line is read-only, so the whole matrix can be
      // rehearsed - selectors, option names, cash flow - without committing.
      //   $env:VARIANT_DRY_RUN="1"
      if (process.env.VARIANT_DRY_RUN === '1') {
        out.verdict = 'CREATED';
        out.dealNo = 'DRY-RUN';
        out.message = 'dry run - stopped before Save, nothing written';
        return;
      }

      // ===================== WRITE: save this variant =====================
      const saveBtn = (await findSaveButton(sapPage)) ?? 'M0:50::btn[11]';
      await clickButton(sapPage, saveBtn);

      // Escalate to the keyboard if the click was swallowed.
      //
      // The instalment and annuity variants both landed here: the correct
      // button was resolved (M0:50::btn[11], tooltip "(Ctrl+S)"), all three
      // click strategies reported success, and the transaction simply stayed on
      // SAPLFTR_IRATE/1100 with no deal, no dialog and no message. A swallowed
      // click is indistinguishable from a refusal in the result, which is
      // exactly the kind of ambiguity that gets written up as a product bug -
      // so try the accelerator before concluding anything.
      if (!(await bodyText(sapPage)).match(/created|angelegt/i)) {
        await sapPage.keyboard.press('Control+S');
        await settle(sapPage, 25_000);
      }

      const dialogs = await handleSaveDialogs(sapPage, SAFE_POPUP, () => {});
      if (dialogs.blocked) {
        out.verdict = 'REFUSED';
        out.message = dialogs.blocked.slice(0, 400);
        await captureEvidence(sapPage, `tc-003-${v.id}-refused-dialog`);
        return;
      }

      const savedText = await bodyText(sapPage);
      const status = await statusMessage(sapPage);
      const errLine = savedText.split('\n').map((l) => l.trim()).find((l) => /^Error:/i.test(l));

      if (errLine) {
        out.verdict = 'REFUSED';
        out.message = errLine;
        await captureEvidence(sapPage, `tc-003-${v.id}-refused`);
        return;
      }

      const msgLine =
        savedText.split('\n').map((l) => l.trim()).find((l) => /created|angelegt/i.test(l)) ?? '';
      const dealNo = msgLine.match(/\b(\d{5,12})\b/)?.[1] ?? status.match(/\b(\d{5,12})\b/)?.[1] ?? '';

      if (!dealNo) {
        // "No deal number" on its own says nothing about why. Capture whatever
        // the transaction is still showing - an open dialog, the screen it
        // landed on, any message-shaped line - so the refusal is diagnosable
        // from the artifact instead of needing the run repeated.
        const stillOpen = await readPopup(sapPage);
        const hints = savedText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => /^(Error|Warning|Enter|Specify|Fill|Message)/i.test(l) && l.length < 200);
        out.verdict = 'REFUSED';
        out.message =
          `no deal number. status="${status}"` +
          `; screen=${JSON.stringify(await screenInfo(sapPage))}` +
          (stillOpen ? `; dialog still open: ${stillOpen.text.replace(/\s+/g, ' ').slice(0, 250)}` : '') +
          (hints.length ? `; messages: ${hints.join(' | ')}` : '');
        await captureEvidence(sapPage, `tc-003-${v.id}-nonumber`);
        await dumpScreen(sapPage, `tc-003-${v.id}-nonumber`, { full: true }).catch(() => {});
        return;
      }

      out.verdict = 'CREATED';
      out.dealNo = dealNo;
      out.message = msgLine || status;
      await captureEvidence(sapPage, `tc-003-${v.id}-${dealNo}-created`);
    } catch (e) {
      const msg = (e as Error).message.split('\n')[0].slice(0, 300);
      // "selected X but it holds Y" is SAP rejecting the setting, not the
      // harness failing to click - the option was found and clicked, and the
      // round trip put the old value back. That is a result about the product.
      out.verdict = /but it holds/.test(msg) ? 'REFUSED' : 'ERROR';
      out.message = msg;
      await captureEvidence(sapPage, `tc-003-${v.id}-error`).catch(() => {});
    } finally {
      results.push(out);
      console.log(`${out.id} -> ${out.verdict} ${out.dealNo} :: ${out.message.slice(0, 140)}`);
    }
  });
}
