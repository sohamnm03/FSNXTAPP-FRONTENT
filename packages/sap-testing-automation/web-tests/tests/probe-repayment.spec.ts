import { test, expect } from '../fixtures';
import {
  openTransaction, setField, setFieldVerified, pressKey, screenInfo,
  handleKnownPopups, writeArtifact, selectDropdown, bodyText, statusMessage,
  readPopup, readCheckRun, captureEvidence, settle, clickButton,
} from '../webgui';

/**
 * READ-ONLY: why does an instalment / annuity repayment refuse to save?
 *
 * The matrix run recorded both as REFUSED with an empty status bar - the save
 * simply did not happen and SAP said nothing the run could see. That is the
 * least useful kind of result, so this probe asks the transaction directly.
 *
 * It presses **Check** (the toolbar's own validation) instead of Save, so the
 * transaction reports everything it objects to without committing anything.
 * The repayment block's own fields are read first, since a required field left
 * empty is the likeliest cause and is invisible in a pass/fail.
 */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;

test.skip(process.env.DISCOVER !== '1', 'probe spec - run with DISCOVER=1');

const METHOD = process.env.REPAYMENT_METHOD ?? 'Instalment Repayment';

test(`PROBE: what does "${METHOD}" require?`, async ({ sapPage }) => {
  test.setTimeout(600_000);
  const out: string[] = [`probe: Repayment Method = ${METHOD}`];

  await openTransaction(sapPage, 'FTR_CREATE');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await setFieldVerified(sapPage, 'Company Code', '9800');
  await setFieldVerified(sapPage, 'Product Type', '10B');
  await setFieldVerified(sapPage, 'Financial Transaction Type', '200');
  await setFieldVerified(sapPage, 'Business Partner Number', '400000003');
  await pressKey(sapPage, 'Enter');

  await setField(sapPage, 'Amount as Text Field', '100000');
  await setFieldVerified(sapPage, 'Term Start', '01.01.2026');
  await setFieldVerified(sapPage, 'End of Term', '31.12.2026');
  await setFieldVerified(sapPage, 'Contract Date', '01.01.2026');

  out.push(`\nselecting Repayment Method -> ${METHOD}`);
  out.push(`got: ${await selectDropdown(sapPage, 'Repayment Method', METHOD)}`);
  await handleKnownPopups(sapPage, SAFE_POPUP, () => {});

  await setField(sapPage, 'Nominal Interest Rate', '10');
  await pressKey(sapPage, 'Enter');
  await handleKnownPopups(sapPage, SAFE_POPUP, () => {});

  // Every field on the Structure tab with its value - a required-but-empty one
  // is what a silent refusal usually comes down to.
  const fields = await sapPage.evaluate(() =>
    Array.from(document.querySelectorAll('input'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        const e = el as HTMLInputElement;
        const r = e.getBoundingClientRect();
        return `  y=${String(Math.round(r.y)).padStart(4)} "${e.title}" = "${e.value}"${e.readOnly ? ' (ro)' : ''}`;
      }),
  );
  out.push(`\n=== Structure tab after applying the variant ===\n${fields.join('\n')}`);

  await captureEvidence(sapPage, `probe-repayment-${METHOD.replace(/\W+/g, '-').toLowerCase()}`);

  // Check, not Save: the transaction validates and reports, and commits nothing.
  const checkBtn = await sapPage.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[role="button"]')) as HTMLElement[];
    const hit = els.find((e) => (e.innerText ?? '').trim() === 'Check');
    return hit ? hit.id : null;
  });
  out.push(`\nCheck button: ${checkBtn}`);

  if (checkBtn) {
    await clickButton(sapPage, checkBtn);
    await settle(sapPage);

    const cr = await readCheckRun(sapPage);
    if (cr) {
      out.push(
        `\n=== CHECK RUN ===\n${cr.terminations} terminations, ${cr.errors} errors, ` +
          `${cr.warnings} warnings, ${cr.information} information\n${cr.text}`,
      );
    } else {
      const pop = await readPopup(sapPage);
      out.push(`\n=== popup after Check ===\n${pop ? pop.text : 'none'}`);
    }

    out.push(`\nstatus bar: "${await statusMessage(sapPage)}"`);
    const text = await bodyText(sapPage);
    const errs = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^(Error|Warning|Message|Enter|Specify|Fill)/i.test(l) && l.length < 200);
    out.push(`\nmessage-shaped lines:\n${errs.join('\n') || '(none)'}`);
    await captureEvidence(sapPage, `probe-repayment-${METHOD.replace(/\W+/g, '-').toLowerCase()}-checked`);
  }

  writeArtifact(`probe-repayment-${METHOD.replace(/\W+/g, '-').toLowerCase()}.txt`, out.join('\n'));
  console.log('written. Check run / messages captured.');
  // Nothing saved - Check does not commit.
});
