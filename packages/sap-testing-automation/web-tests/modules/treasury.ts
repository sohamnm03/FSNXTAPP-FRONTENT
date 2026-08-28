/**
 * Treasury business components — create, settle and post a financial
 * transaction, once, for every case that needs them.
 *
 * TC-002 (one deal, staged) and TC-008 (ten deals, batched) drove the same three
 * writes through the same three screens with two copies of the code. They now
 * share this one. The split of responsibility is deliberate:
 *
 *   these functions perform the step and *report* what SAP did;
 *   the spec decides what counts as a pass.
 *
 * That is why nothing here throws on a business outcome. A refused save is a
 * return value, because TC-002 must fail on it and TC-008 must record it as
 * REFUSED and move to the next deal — the same step, two different verdicts.
 * Genuine mechanical failures (a field that will not accept a value, a button
 * with no layout box) still throw, from the helpers in ../webgui.
 */
import type { Page } from '@playwright-sap/test';
import {
  pressKey, statusMessage, bodyText, handleKnownPopups, handleSaveDialogs,
  captureEvidence, dumpIfDiscovering, writeArtifact, dismissLiveSearch,
} from '../webgui';
import {
  screen, openScreen, awaitScreen, mSet, mRead, mReadOptional, mReadAll,
  mClick, mButtonId, mSetCheckbox, mReadCheckbox,
} from '../screens';
import {
  assertDevSystem, documentDescriptor, documentNumber, inputValues, refusalLine,
} from './session';
import { journal } from '../journal';

/**
 * Dialogs a treasury flow may confirm without asking.
 *
 * Only the working-day check, which is a direct consequence of the requested
 * dates (01.01.2026 is a public holiday, reached by term start, term end and
 * contract date). Anything else stops the step with its text reported rather
 * than being clicked through.
 */
export const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag/i;

export type StepCtx = {
  note: (s: string) => void;
  /** Prefix for evidence screenshots and artifacts, e.g. 'tc-002' or 'tc-008-03'. */
  tag: string;
  /**
   * Distinguishes runs of the same case that differ only in data, for the one
   * screenshot taken before the deal number exists.
   *
   * The pre-save deal screen is the only view in the whole flow that shows the
   * interest schedule, and at that moment there is no deal number to name the
   * file after. Without a variant, a later baseline run silently overwrites the
   * month-end run's only proof of its own schedule.
   */
  variant?: string;
  /** Dialogs this run may auto-confirm. Defaults to SAFE_POPUP. */
  safePopup?: RegExp;
  /**
   * What this flow is creating, as the entry screen was told it.
   *
   * Set by `openDealEntry`, not by the spec. It is the fallback description for
   * the run file's "Documents created" row when SAP's own confirmation line
   * cannot be read — a row saying "product type 22A, txn type 100" is worth
   * having; one saying "a document" is not.
   */
  product?: { companyCode: string; productType: string; transactionType: string };
};

const safe = (ctx: StepCtx) => ctx.safePopup ?? SAFE_POPUP;

/**
 * Fallback description of what a flow was creating, for the run file.
 *
 * Only used when SAP's own confirmation line could not be read - see
 * `documentDescriptor`. Says what was requested, and does not pretend to know
 * what SAP made of it.
 */
function describe(ctx: StepCtx): string {
  const p = ctx.product;
  if (!p) return 'Financial transaction';
  return `Financial transaction (product type ${p.productType}, txn type ${p.transactionType})`;
}

export type TermLoanSpec = {
  companyCode: string;
  productType: string;
  transactionType: string;
  partner: string;
  amount: string;
  currency: string;
  interestRate: string;
  startDate: string;
  endDate: string;
  /** Must be <= startDate or SAP refuses the save outright. */
  contractDate: string;
  /** Frequency Indicator entry. Empty leaves SAP's default ('At End of Term'). */
  interestFrequency?: string;
  /**
   * "General Valuation Class" (Administr. tab). Absent leaves it unset, which
   * is fine for product types that do not require it (e.g. 10B/9800 - TC-002
   * never sets this) but a hard save-time refusal for others (e.g. 22A/1000 -
   * "Fill the following required field: General Valuation Class"). A dropdown,
   * not free text - the value must be one of its exact option labels
   * ("Short Term", "Long Term", ...), not a coded key.
   */
  generalValuationClass?: string;
  /**
   * FTR_CREATE deal screen's Interest Category dropdown. Absent leaves SAP's
   * default (Fixed) and interestRate is used as the nominal rate, unchanged
   * from every case before TC-013. Set to 'Variable' to switch the interest
   * block to reference-rate mode - see referenceInterestRate.
   */
  interestCategory?: string;
  /**
   * Required once interestCategory is 'Variable' - SAP refuses the save
   * without one ("Enter a reference interest rate", found by TC-003's V10
   * discovery). A code typed directly, e.g. 'RBI_REPO' - see
   * discover-ftr-1000-22a-variable-rate.spec.ts for how to find valid codes
   * for a given company code via the field's own F4 search help. Ignored
   * when interestCategory is not 'Variable'.
   */
  referenceInterestRate?: string;
};

export type FilledDeal = {
  filled: Record<string, string | null>;
  frequency: { indicator: string; count: string | null; unit: string | null } | null;
  refused: string | null;
  blocked: string | null;
};

export type SavedDeal = {
  dealNo: string;
  refused: string | null;
  blocked: string | null;
  checkRun: string[];
  status: string;
};

/**
 * FTR_CREATE entry screen: name the product, press Enter, land on the deal
 * screen. Read-only — nothing here commits.
 */
export async function openDealEntry(page: Page, spec: TermLoanSpec, ctx: StepCtx) {
  const entry = screen('ftr-create-entry');
  await openScreen(page, entry);
  await assertDevSystem(page, entry.transaction, ctx.note);

  ctx.note('--- FTR_CREATE entry screen ---');
  ctx.product = {
    companyCode: spec.companyCode,
    productType: spec.productType,
    transactionType: spec.transactionType,
  };
  journal.step(
    `FTR_CREATE entry — co.code ${spec.companyCode}, product ${spec.productType}, ` +
      `txn type ${spec.transactionType}, partner ${spec.partner}`,
  );
  await mSet(page, entry, 'companyCode', spec.companyCode);
  // Company Code is a live-search field on every screen it appears on (this
  // one, FTR_EDIT, TBB1, TPM44, TPM1): typing it opens an inline "Search
  // Results" suggestion list, rendered asynchronously after a server round
  // trip, that overlaps the field below it and, left open, intercepts every
  // click there until it times out. Every mSet(..., 'companyCode', ...) in
  // this file is followed by dismissLiveSearch() for the same reason.
  await dismissLiveSearch(page);
  await mSet(page, entry, 'productType', spec.productType);
  await mSet(page, entry, 'transactionType', spec.transactionType);
  await mSet(page, entry, 'partner', spec.partner);

  for (const name of ['companyCode', 'productType', 'transactionType', 'partner']) {
    ctx.note(`  ${name} = "${await mRead(page, entry, name)}"`);
  }

  await pressKey(page, 'Enter');
  ctx.note(`status: ${await statusMessage(page)}`);
  await dumpIfDiscovering(page, `${ctx.tag}-create-entry`);
}

/**
 * Fill the term-loan deal screen and let SAP derive the cash flow. Read-only.
 *
 * Values are read back *after* the Enter round trip, not after typing: SAP
 * reformats amounts and rates, and a dropdown selection that SAP silently
 * reverted looks identical on screen until the round trip has happened.
 */
export async function fillTermLoan(
  page: Page,
  spec: TermLoanSpec,
  ctx: StepCtx,
): Promise<FilledDeal> {
  const deal = screen('ftr-deal-irate');
  ctx.note(`--- deal screen (${deal.dynpro}) ---`);
  await awaitScreen(page, deal);

  await mSet(page, deal, 'amount', spec.amount);
  await mSet(page, deal, 'termStart', spec.startDate);
  await mSet(page, deal, 'termEnd', spec.endDate);
  await mSet(page, deal, 'contractDate', spec.contractDate);

  // Interest Category next - it rebuilds the whole interest block (nominal
  // rate vs. reference-rate/markup/first-period fields), so anything inside
  // that block is only touched after this, per TC-003's variant-matrix rule
  // ("rate fields last"). Absent, SAP's default (Fixed) applies and nothing
  // here changes for any case written before TC-013.
  let isVariableRate = false;
  if (spec.interestCategory) {
    ctx.note(`  setting Interest Category -> "${spec.interestCategory}"`);
    const gotCat = await mSet(page, deal, 'interestCategory', spec.interestCategory);
    ctx.note(`  Interest Category = "${gotCat}"`);
    await handleKnownPopups(page, safe(ctx), ctx.note);
    isVariableRate = gotCat.trim().toLowerCase() === 'variable';
  }

  // Currency defaults from the product type; assert rather than assume.
  const currency = await mRead(page, deal, 'currency');
  ctx.note(`  currency (defaulted) = "${currency}"`);
  if (currency.trim().toUpperCase() !== spec.currency.toUpperCase()) {
    await mSet(page, deal, 'currency', spec.currency);
  }

  // Set before the Enter that derives the cash flow, so the flows are generated
  // on the chosen rhythm rather than on the default and then rebuilt.
  if (spec.interestFrequency) {
    ctx.note(`  setting Frequency Indicator -> "${spec.interestFrequency}"`);
    const got = await mSet(page, deal, 'frequencyIndicator', spec.interestFrequency);
    ctx.note(`  Frequency Indicator = "${got}"`);
    await handleKnownPopups(page, safe(ctx), ctx.note);
  } else {
    ctx.note(
      `  Frequency Indicator left at SAP default = "${await mReadOptional(page, deal, 'frequencyIndicator')}"`,
    );
  }

  // Rate last, same rule as Interest Category: Fixed mode uses nominalRate;
  // Variable mode has no nominalRate field at all and needs
  // referenceInterestRate instead, set only now that the interest block has
  // already been rebuilt above.
  if (isVariableRate) {
    if (spec.referenceInterestRate) {
      ctx.note(`  setting Reference Interest Rate -> "${spec.referenceInterestRate}"`);
      const gotRef = await mSet(page, deal, 'referenceInterestRate', spec.referenceInterestRate);
      ctx.note(`  Reference Interest Rate = "${gotRef}"`);
      await handleKnownPopups(page, safe(ctx), ctx.note);
    }
  } else {
    await mSet(page, deal, 'nominalRate', spec.interestRate);
  }

  await pressKey(page, 'Enter');

  const popups = await handleKnownPopups(page, safe(ctx), ctx.note);
  ctx.note(`popups handled before save: ${popups.handled}`);

  const filled = await mReadAll(page, deal, [
    'amount', 'currency', 'termStart', 'termEnd', 'nominalRate', 'contractDate',
    ...(isVariableRate ? ['interestCategory', 'referenceInterestRate'] : []),
  ]);
  ctx.note(`DEAL SCREEN AS FILLED:\n${JSON.stringify(filled, null, 2)}`);

  let frequency: FilledDeal['frequency'] = null;
  if (spec.interestFrequency) {
    frequency = {
      indicator: await mRead(page, deal, 'frequencyIndicator'),
      count: await mReadOptional(page, deal, 'frequencyCount'),
      unit: await mReadOptional(page, deal, 'frequencyUnit'),
    };
    ctx.note(
      `INTEREST SCHEDULE: indicator="${frequency.indicator}" every "${frequency.count}" "${frequency.unit}"`,
    );
    writeArtifact(
      `${ctx.tag}-interest-schedule.txt`,
      `Frequency Indicator: ${frequency.indicator}\nDefined Frequency: ${frequency.count}\nUnit: ${frequency.unit}\n`,
    );
  }

  if (spec.generalValuationClass) {
    ctx.note(`  setting General Valuation Class -> "${spec.generalValuationClass}" (Administr. tab)`);
    await mClick(page, deal, 'administrTab');
    const gvc = await mSet(page, deal, 'generalValuationClass', spec.generalValuationClass);
    ctx.note(`  General Valuation Class = "${gvc}"`);
    await mClick(page, deal, 'structureTab');
  }

  await dumpIfDiscovering(page, `${ctx.tag}-create-filled`);
  ctx.note(`status after Enter: ${await statusMessage(page)}`);

  const refused = refusalLine(await bodyText(page));
  if (refused) {
    ctx.note(`SAP REFUSED BEFORE SAVE: ${refused}`);
    await captureEvidence(page, `${ctx.tag}-refused-pre-save`);
  }

  return { filled, frequency, refused: refused || null, blocked: popups.blocked };
}

/**
 * WRITE. Save the deal on screen and capture the number SAP assigns it.
 *
 * The number is taken from SAP's own confirmation, never from a guess — a wrong
 * number would settle and post somebody else's deal.
 */
export async function saveDeal(page: Page, ctx: StepCtx): Promise<SavedDeal> {
  const deal = screen('ftr-deal-irate');
  await dumpIfDiscovering(page, `${ctx.tag}-before-save`);
  await captureEvidence(
    page,
    `${ctx.tag}-deal-filled${ctx.variant ? `-${ctx.variant.replace(/\W+/g, '-').toLowerCase()}` : ''}`,
  );

  ctx.note('*** WRITE: SAVING the deal - this commits to the target client ***');
  const btn = await mClick(page, deal, 'save');
  ctx.note(`Save button resolved to: ${btn}`);

  const dialogs = await handleSaveDialogs(page, safe(ctx), ctx.note);
  ctx.note(`dialogs handled during save: ${dialogs.handled}`);
  if (dialogs.checkRun.length) {
    writeArtifact(`${ctx.tag}-create-check-run.txt`, dialogs.checkRun.join('\n\n'));
  }

  await dumpIfDiscovering(page, `${ctx.tag}-saved`);
  const savedText = await bodyText(page);
  const status = await statusMessage(page);
  ctx.note(`status after save: "${status}"`);

  const refused = refusalLine(savedText);
  if (refused) {
    ctx.note(`SAP REFUSED THE SAVE: ${refused}`);
    await captureEvidence(page, `${ctx.tag}-refused-save`, 'SAP refused the save');
    journal.step('WRITE 1 — save the deal', 'refused', refused);
    // Recorded even though nothing was written: "attempted, wrote nothing" is a
    // reportable state, and a run file with no row here would read as a run
    // that never tried.
    journal.document({
      docType: describe(ctx),
      number: null,
      companyCode: ctx.product?.companyCode,
      lifecycle: [],
      leftInPlace: false,
      note: `refused: ${refused}`,
    });
    return { dealNo: '', refused, blocked: dialogs.blocked, checkRun: dialogs.checkRun, status };
  }

  const fromField = (await mReadOptional(page, deal, 'transactionNumber')) ?? '';
  const dealNo = documentNumber(savedText, status, fromField);
  ctx.note(`DEAL NUMBER: ${dealNo || 'NOT OBSERVED'}`);

  const descriptor = documentDescriptor(savedText, status);
  journal.step(
    'WRITE 1 — save the deal',
    dealNo ? 'ok' : 'error',
    dealNo ? `${descriptor?.docType ?? 'document'} ${dealNo}` : 'no document number was returned',
  );
  journal.document({
    docType: descriptor?.docType ?? describe(ctx),
    number: dealNo || null,
    companyCode: descriptor?.companyCode ?? ctx.product?.companyCode,
    lifecycle: dealNo ? ['created'] : [],
    leftInPlace: true,
  });

  if (dealNo) {
    // The status bar still reads "Interest rate instrument <n> ... is created" —
    // nothing has navigated yet. This screenshot is the evidence of the write.
    ctx.note(
      `  evidence: ${await captureEvidence(
        page,
        `${ctx.tag}-${dealNo}-1-created`,
        `${descriptor?.docType ?? 'Deal'} ${dealNo} created`,
      )}`,
    );
  }

  return { dealNo, refused: null, blocked: dialogs.blocked, checkRun: dialogs.checkRun, status };
}

export type SettleResult = {
  state: 'settled' | 'already-settled' | 'opened' | 'blocked';
  blocked: string | null;
  status: string;
  screenText: string;
  values: string[];
  checkRun: string[];
};

/**
 * FTR_EDIT -> Settle on a named deal. Opens settlement, then commits it unless
 * `commit` is false.
 *
 * A deal can only be settled once. An already-settled deal reports
 * `already-settled`, not a failure — the settlement being asserted is simply
 * already true, and settling twice is not idempotent.
 */
export async function settleDeal(
  page: Page,
  args: { companyCode: string; dealNo: string },
  ctx: StepCtx,
  opts: { commit?: boolean } = {},
): Promise<SettleResult> {
  const commit = opts.commit ?? true;
  const edit = screen('ftr-edit-entry');

  ctx.note(`\n--- FTR_EDIT settle, deal ${args.dealNo} ---`);
  await openScreen(page, edit);
  await assertDevSystem(page, edit.transaction, ctx.note);

  await mSet(page, edit, 'companyCode', args.companyCode);
  await dismissLiveSearch(page);
  await mSet(page, edit, 'transaction', args.dealNo);
  ctx.note(`  companyCode = "${await mRead(page, edit, 'companyCode')}"`);
  ctx.note(`  transaction = "${await mRead(page, edit, 'transaction')}"`);

  const settleId = await mClick(page, edit, 'settle');
  ctx.note(`  clicked Settle (${settleId})`);

  const opening = await handleSaveDialogs(page, safe(ctx), ctx.note);
  if (opening.blocked) {
    await captureEvidence(page, `${ctx.tag}-${args.dealNo}-settle-blocked`);
    return {
      state: 'blocked',
      blocked: `dialog opening settlement: ${opening.blocked}`,
      status: await statusMessage(page),
      screenText: await bodyText(page),
      values: [],
      checkRun: opening.checkRun,
    };
  }

  await dumpIfDiscovering(page, `${ctx.tag}-settle-open`);
  const screenText = await bodyText(page);
  const values = await inputValues(page);
  const openStatus = await statusMessage(page);
  writeArtifact(
    `${ctx.tag}-settle-screen.txt`,
    `${screenText}\n\n--- input values ---\n${values.join('\n')}`,
  );

  // Two distinct wordings for the same fact, seen across screen programs: the
  // loan/deposit screens say "Settlement already carried out"; the securities
  // screen (TS04) instead refuses the Settle action itself with "This function
  // is not available for activity category Contract Settlement" - i.e. the
  // deal is already past the settlement activity.
  if (/settlement already carried out|not available for activity category/i.test(`${screenText} ${openStatus}`)) {
    ctx.note('SETTLEMENT ALREADY CARRIED OUT on this deal - write skipped, already satisfied.');
    writeArtifact(`${ctx.tag}-settled-result.txt`, 'settlement already carried out (skipped this run)');
    journal.step(
      `FTR_EDIT settle deal ${args.dealNo}`,
      'skipped',
      'settlement already carried out - the state being asserted was already true',
    );
    return {
      state: 'already-settled', blocked: null, status: openStatus,
      screenText, values, checkRun: opening.checkRun,
    };
  }

  if (!commit) {
    ctx.note('settlement screen open, nothing saved.');
    return { state: 'opened', blocked: null, status: openStatus, screenText, values, checkRun: opening.checkRun };
  }

  ctx.note('*** WRITE: SAVING the settlement - this commits to the target client ***');
  const saveId = await mClick(page, edit, 'save');
  ctx.note(`Settle save button resolved to: ${saveId}`);

  const saving = await handleSaveDialogs(page, safe(ctx), ctx.note);
  ctx.note(`dialogs handled during settle save: ${saving.handled}`);
  if (saving.checkRun.length) {
    writeArtifact(`${ctx.tag}-settle-check-run.txt`, saving.checkRun.join('\n\n'));
  }
  if (saving.blocked) {
    await captureEvidence(page, `${ctx.tag}-${args.dealNo}-settle-refused`, 'settlement refused');
    journal.step(`WRITE 2 — save the settlement (deal ${args.dealNo})`, 'blocked', saving.blocked);
    return {
      state: 'blocked', blocked: `dialog during settle save: ${saving.blocked}`,
      status: await statusMessage(page), screenText: await bodyText(page), values,
      checkRun: [...opening.checkRun, ...saving.checkRun],
    };
  }

  await dumpIfDiscovering(page, `${ctx.tag}-settled`);
  const settledStatus = await statusMessage(page);
  const settledText = await bodyText(page);
  ctx.note(`status after settle save: "${settledStatus}"`);
  writeArtifact(`${ctx.tag}-settled-result.txt`, `status: ${settledStatus}\n\n${settledText}`);
  journal.step(`WRITE 2 — save the settlement (deal ${args.dealNo})`, 'ok', settledStatus);
  journal.documentReached(args.dealNo, 'settled');
  ctx.note(
    `  evidence: ${await captureEvidence(
      page,
      `${ctx.tag}-${args.dealNo}-2-settled`,
      `Deal ${args.dealNo} settlement saved`,
    )}`,
  );

  return {
    // screenText is the pre-save (opening) body text, not settledText: by the
    // time the save completes the screen has navigated past "Contract
    // settlement" mode to the change/confirmation view, so asserting mode off
    // the post-save text always fails on a genuine first-time settle.
    state: 'settled', blocked: null, status: settledStatus, screenText, values,
    checkRun: [...opening.checkRun, ...saving.checkRun],
  };
}

export type PostResult = {
  text: string;
  status: string;
  selection: Record<string, string>;
  blocked: string | null;
  /**
   * Set when TBB1's own selection screen refused to execute, exactly as on
   * {@link TpmRunResult}. Silent in every other signal: the screen still shows
   * the selection and `blocked` is null because no dialog was raised, so a
   * caller asserting only on `blocked` never learns the post did not happen.
   */
  refusedToRun: string | null;
};

/**
 * TBB1's "Information Overview" result popup, when it is the one on screen.
 *
 * Two different result presentations exist for the same transaction, and which
 * one appears is a property of the data, not of the run: company code 9800
 * (TC-002, TC-008) gets the posting log inline on the list screen, while 1000
 * (TC-009) gets it behind a modal listing "Posting Log" and "Messages". Left
 * alone the modal covers the screen, so `bodyText` returns the popup chrome and
 * an assertion on the deal number fails against a run that actually worked.
 *
 * Returns the posting-log text when it drilled in, or null when this popup is
 * not on screen at all - which is the TC-002 path, and must stay untouched.
 */
async function readPostingLogPopup(
  page: Page,
  ctx: StepCtx,
): Promise<{ text: string } | null> {
  // Detected by its own content, not by the modal title: the title sits in an
  // ancestor of the `M1:` popup elements rather than in them, so matching on
  // those finds nothing. The rows are an ALV grid (`grid#C<n>#<row>,<col>`),
  // not a tree - the icon cell ignores clicks and neither Enter nor a
  // double-click opens anything. The text cell itself is the hotspot.
  const cellId = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('td[id*="grid#"]'));
    const hit = cells.find((c) => /^posting log$/i.test((c.textContent ?? '').trim()));
    return hit?.id ?? null;
  });
  if (!cellId) return null;

  ctx.note(`  TBB1 Information Overview popup - opening its Posting Log (${cellId})`);
  await page.locator(`[id="${cellId}"]`).first().click({ force: true, timeout: 10_000 });
  await page.waitForTimeout(2000);

  return { text: await bodyText(page) };
}

/**
 * TBB1 post flows. `testRun: true` simulates and writes nothing; `false` commits.
 *
 * Test Run defaults to ON, so a "post" that never clears it simulates, reports
 * success and writes nothing — which is why the flag is driven and then re-read
 * rather than assumed, and why the selection is returned for the caller to
 * assert on.
 */
export async function postFlows(
  page: Page,
  args: { companyCode: string; dealNo: string; dueDate: string; postingDate: string },
  testRun: boolean,
  ctx: StepCtx,
): Promise<PostResult> {
  const tbb1 = screen('tbb1-selection');
  await openScreen(page, tbb1);
  await assertDevSystem(page, tbb1.transaction, ctx.note);

  await mSet(page, tbb1, 'companyCode', args.companyCode);
  await dismissLiveSearch(page);
  await mSet(page, tbb1, 'transaction', args.dealNo);
  await mSet(page, tbb1, 'dueDateCutoff', args.dueDate);
  await mSet(page, tbb1, 'postingDate', args.postingDate);
  await mSetCheckbox(page, tbb1, 'testRun', testRun, ctx.note);

  const selection = {
    companyCode: await mRead(page, tbb1, 'companyCode'),
    transaction: await mRead(page, tbb1, 'transaction'),
    dueDateCutoff: await mRead(page, tbb1, 'dueDateCutoff'),
    postingDate: await mRead(page, tbb1, 'postingDate'),
    testRun: String(await mReadCheckbox(page, tbb1, 'testRun')),
  };
  ctx.note(`TBB1 SELECTION (testRun=${testRun}):\n${JSON.stringify(selection, null, 2)}`);
  await dumpIfDiscovering(page, `${ctx.tag}-tbb1-selection-${testRun ? 'test' : 'live'}`);

  ctx.note(`  executing TBB1 (F8), testRun=${testRun}`);
  if (!testRun) ctx.note('*** WRITE: TBB1 live post - this commits to the target client ***');
  await mClick(page, tbb1, 'execute', 60_000);

  // Drill into the result popup first, when that is how this data presents its
  // result. Returns null on the inline-list path, leaving the flow below
  // exactly as it was.
  const overview = await readPostingLogPopup(page, ctx);

  const dialogs = await handleSaveDialogs(page, safe(ctx), ctx.note);

  await dumpIfDiscovering(page, `${ctx.tag}-tbb1-result-${testRun ? 'test' : 'live'}`);
  const text = overview?.text ?? (await bodyText(page));
  const status = await statusMessage(page);
  ctx.note(`TBB1 status (testRun=${testRun}): "${status}"`);
  writeArtifact(`${ctx.tag}-tbb1-${testRun ? 'testrun' : 'live'}.txt`, `status: ${status}\n\n${text}`);
  // TBB1's selection screen can refuse the run exactly as TPM44's and TPM1's do
  // ("Fill in all required entry fields"), and this function used to be the only
  // one of the three that never looked. Outcome was hardcoded `ok` and the deal
  // was marked `posted` on the strength of testRun alone, so a refused post
  // produced a run file claiming a write that never happened - rule 6, in the
  // one place the dashboard and the freeze gate both read.
  const refusedToRun = selectionRefusal(status, text);
  if (refusedToRun) ctx.note(`  TBB1 DID NOT RUN - selection screen refused it: ${refusedToRun}`);

  journal.step(
    testRun
      ? `TBB1 simulation (deal ${args.dealNo}) — Test Run on, nothing committed`
      : `WRITE 3 — TBB1 live post (deal ${args.dealNo}, posting date ${args.postingDate})`,
    refusedToRun ? 'refused' : 'ok',
    refusedToRun ?? `Test Run read back as ${selection.testRun}${status ? `; ${status}` : ''}`,
  );
  if (!testRun && !refusedToRun) journal.documentReached(args.dealNo, 'posted');
  ctx.note(
    `  evidence: ${await captureEvidence(
      page,
      `${ctx.tag}-${args.dealNo}-3-tbb1-${testRun ? 'testrun' : 'live'}`,
      `TBB1 ${testRun ? 'simulation' : 'live post'} for deal ${args.dealNo}`,
    )}`,
  );

  return { text, status, selection, blocked: dialogs.blocked, refusedToRun };
}

export type TpmRunArgs = {
  companyCode: string;
  dealNo: string;
  keyDate: string;
  valuationArea?: string;
  valuationClass?: string;
  /** TPM1 only, and mandatory there - TPM1 will not execute without it. */
  valuationCategory?: string;
};

export type TpmRunResult = {
  text: string;
  status: string;
  selection: Record<string, string>;
  blocked: string | null;
  /**
   * True when the transaction never ran because its own selection screen
   * refused it - "Make an entry in mandatory field ...", "Fill in all
   * required entry fields".
   *
   * Worth a field of its own because the refusal is silent in every other
   * signal: the screen still shows the selection, `blocked` is null (no
   * dialog was raised), and the status bar carries the message that a caller
   * asserting only on `blocked` and `selection` never reads. TC-009's first
   * green TPM1 run had executed nothing at all.
   */
  refusedToRun: string | null;
};

/** A selection screen that refused to execute, as its own message or ''. */
function selectionRefusal(status: string, text: string): string | null {
  const pattern = /(make an entry in mandatory field[^\n]*|fill in all required entry fields[^\n]*|fill the following required field[^\n]*)/i;
  return (status.match(pattern)?.[1] ?? text.match(pattern)?.[1] ?? null);
}

/**
 * TPM44 accrual/deferral run, scoped to one deal by its Financial Transaction
 * number. `testRun: true` simulates and writes nothing; `false` commits.
 *
 * Test Run defaults to ON here too - the same trap as TBB1 - so it is driven
 * and read back rather than assumed, exactly like `postFlows`.
 */
export async function runAccrualDeferral(
  page: Page,
  args: TpmRunArgs,
  testRun: boolean,
  ctx: StepCtx,
): Promise<TpmRunResult> {
  const tpm44 = screen('tpm44-selection');
  await openScreen(page, tpm44);
  await assertDevSystem(page, tpm44.transaction, ctx.note);

  await mSet(page, tpm44, 'companyCode', args.companyCode);
  await dismissLiveSearch(page);
  await mSet(page, tpm44, 'transaction', args.dealNo);
  if (args.valuationArea) await mSet(page, tpm44, 'valuationArea', args.valuationArea);
  if (args.valuationClass) await mSet(page, tpm44, 'valuationClass', args.valuationClass);
  await mSet(page, tpm44, 'keyDate', args.keyDate);
  await mSetCheckbox(page, tpm44, 'testRun', testRun, ctx.note);

  const selection = {
    companyCode: await mRead(page, tpm44, 'companyCode'),
    transaction: await mRead(page, tpm44, 'transaction'),
    valuationArea: (await mReadOptional(page, tpm44, 'valuationArea')) ?? '',
    valuationClass: (await mReadOptional(page, tpm44, 'valuationClass')) ?? '',
    keyDate: await mRead(page, tpm44, 'keyDate'),
    testRun: String(await mReadCheckbox(page, tpm44, 'testRun')),
  };
  ctx.note(`TPM44 SELECTION (testRun=${testRun}):\n${JSON.stringify(selection, null, 2)}`);
  await dumpIfDiscovering(page, `${ctx.tag}-tpm44-selection-${testRun ? 'test' : 'live'}`);

  ctx.note(`  executing TPM44 (F8), testRun=${testRun}`);
  if (!testRun) ctx.note('*** WRITE: TPM44 live run - this commits to the target client ***');
  await mClick(page, tpm44, 'execute', 60_000);

  const dialogs = await handleSaveDialogs(page, safe(ctx), ctx.note);

  await dumpIfDiscovering(page, `${ctx.tag}-tpm44-result-${testRun ? 'test' : 'live'}`);
  const text = await bodyText(page);
  const status = await statusMessage(page);
  ctx.note(`TPM44 status (testRun=${testRun}): "${status}"`);
  writeArtifact(`${ctx.tag}-tpm44-${testRun ? 'testrun' : 'live'}.txt`, `status: ${status}\n\n${text}`);
  ctx.note(
    `  evidence: ${await captureEvidence(
      page,
      `${ctx.tag}-${args.dealNo}-4-tpm44-${testRun ? 'testrun' : 'live'}`,
      `TPM44 ${testRun ? 'simulation' : 'live accrual run'} for deal ${args.dealNo} at ${args.keyDate}`,
    )}`,
  );

  const refusedToRun = selectionRefusal(status, text);
  if (refusedToRun) ctx.note(`  TPM44 DID NOT RUN - selection screen refused it: ${refusedToRun}`);

  journal.step(
    testRun
      ? `TPM44 simulation (deal ${args.dealNo}, key date ${args.keyDate})`
      : `WRITE — TPM44 live accrual/deferral run (deal ${args.dealNo}, key date ${args.keyDate})`,
    refusedToRun ? 'refused' : 'ok',
    refusedToRun ?? `Test Run read back as ${selection.testRun}${status ? `; ${status}` : ''}`,
  );
  if (!testRun && !refusedToRun) journal.documentReached(args.dealNo, 'accrued');

  return { text, status, selection, blocked: dialogs.blocked, refusedToRun };
}

/**
 * TPM1 valuation run, scoped to one deal by its Financial Transaction number.
 * `testRun: true` simulates and writes nothing; `false` commits.
 *
 * Test Run defaults to ON here too - driven and read back, never assumed.
 */
export async function runValuation(
  page: Page,
  args: TpmRunArgs,
  testRun: boolean,
  ctx: StepCtx,
): Promise<TpmRunResult> {
  const tpm1 = screen('tpm1-selection');
  await openScreen(page, tpm1);
  await assertDevSystem(page, tpm1.transaction, ctx.note);

  await mSet(page, tpm1, 'companyCode', args.companyCode);
  await dismissLiveSearch(page);
  await mSet(page, tpm1, 'transaction', args.dealNo);
  if (args.valuationArea) await mSet(page, tpm1, 'valuationArea', args.valuationArea);
  if (args.valuationClass) await mSet(page, tpm1, 'valuationClass', args.valuationClass);
  await mSet(page, tpm1, 'keyDate', args.keyDate);
  if (args.valuationCategory) await mSet(page, tpm1, 'valuationCategory', args.valuationCategory);
  await mSetCheckbox(page, tpm1, 'testRun', testRun, ctx.note);

  const selection = {
    companyCode: await mRead(page, tpm1, 'companyCode'),
    transaction: await mRead(page, tpm1, 'transaction'),
    valuationArea: (await mReadOptional(page, tpm1, 'valuationArea')) ?? '',
    valuationClass: (await mReadOptional(page, tpm1, 'valuationClass')) ?? '',
    keyDate: await mRead(page, tpm1, 'keyDate'),
    valuationCategory: (await mReadOptional(page, tpm1, 'valuationCategory')) ?? '',
    testRun: String(await mReadCheckbox(page, tpm1, 'testRun')),
  };
  ctx.note(`TPM1 SELECTION (testRun=${testRun}):\n${JSON.stringify(selection, null, 2)}`);
  await dumpIfDiscovering(page, `${ctx.tag}-tpm1-selection-${testRun ? 'test' : 'live'}`);

  ctx.note(`  executing TPM1 (F8), testRun=${testRun}`);
  await mClick(page, tpm1, 'execute', 60_000);

  // TPM1 is two steps, and the first one writes nothing: F8 only selects, and
  // lands on "Display Selected Treasury Positions for Valuation" listing the
  // deal as "Valuation Allowed". Stopping there produces no error, no warning
  // and no valuation - which is exactly what TC-009 did until this was found.
  // The handle comes from the screen model, not a literal. A hardcoded id here
  // was invisible to screen-model-check.spec.ts, so a transport moving this
  // button would make `positionsScreen` silently false forever - and the whole
  // point of the flag is to notice when Run Valuation was not pressed.
  const runValuationId = await mButtonId(page, tpm1, 'runValuation');
  const positionsScreen = await page
    .locator(`[id="${runValuationId}"]`)
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (positionsScreen) {
    ctx.note('  TPM1 selected positions; pressing "Run Valuation" to actually value them');
    if (!testRun) ctx.note('*** WRITE: TPM1 live run - this commits to the target client ***');
    await mClick(page, tpm1, 'runValuation', 60_000);
  } else {
    ctx.note('  TPM1 did not land on the positions screen - no Run Valuation button to press.');
  }

  const dialogs = await handleSaveDialogs(page, safe(ctx), ctx.note);

  await dumpIfDiscovering(page, `${ctx.tag}-tpm1-result-${testRun ? 'test' : 'live'}`);
  const text = await bodyText(page);
  const status = await statusMessage(page);
  ctx.note(`TPM1 status (testRun=${testRun}): "${status}"`);
  writeArtifact(`${ctx.tag}-tpm1-${testRun ? 'testrun' : 'live'}.txt`, `status: ${status}\n\n${text}`);
  ctx.note(
    `  evidence: ${await captureEvidence(
      page,
      `${ctx.tag}-${args.dealNo}-5-tpm1-${testRun ? 'testrun' : 'live'}`,
      `TPM1 ${testRun ? 'simulation' : 'live valuation run'} for deal ${args.dealNo} at ${args.keyDate}`,
    )}`,
  );

  const refusedToRun = selectionRefusal(status, text);
  if (refusedToRun) ctx.note(`  TPM1 DID NOT RUN - selection screen refused it: ${refusedToRun}`);

  // Nothing is valued unless Run Valuation was actually pressed.
  //
  // `refusedToRun` only catches the selection screen refusing outright. A run
  // that got past selection but never reached the positions screen also wrote
  // nothing - and used to record outcome `ok` plus lifecycle `valued` anyway,
  // which is the phantom pass this function's own comment says was found once
  // already (the fix pressed the button but kept recording as if it always had).
  // The detail string was honest about it while the two fields the dashboard and
  // the run file actually read were not.
  const didValue = !refusedToRun && positionsScreen;

  journal.step(
    testRun
      ? `TPM1 simulation (deal ${args.dealNo}, key date ${args.keyDate})`
      : `WRITE — TPM1 live valuation run (deal ${args.dealNo}, key date ${args.keyDate})`,
    refusedToRun ? 'refused' : positionsScreen ? 'ok' : 'blocked',
    refusedToRun ??
      `Test Run read back as ${selection.testRun}; ` +
        `${positionsScreen ? 'Run Valuation pressed' : 'no positions screen - Run Valuation not pressed, nothing was valued'}` +
        `${status ? `; ${status}` : ''}`,
  );
  if (!testRun && didValue) journal.documentReached(args.dealNo, 'valued');

  // A live run that never pressed the button differs from the case, so it must
  // cost a deviation - otherwise it counts toward the two clean runs a case
  // needs to freeze, and the thing being frozen is a valuation that never ran.
  if (!testRun && !refusedToRun && !positionsScreen) {
    journal.deviation(
      `TPM1 for deal ${args.dealNo} did not reach the positions screen, so "Run Valuation" ` +
        `was never pressed and nothing was valued. The selection screen did not refuse the run, ` +
        `so this is an unexpected screen rather than a rejected selection.`,
    );
  }

  return { text, status, selection, blocked: dialogs.blocked, refusedToRun };
}
