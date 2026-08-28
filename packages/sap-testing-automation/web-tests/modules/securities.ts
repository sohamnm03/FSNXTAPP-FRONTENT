/**
 * Securities business components — create a Class (FWZZ) and a deal against
 * it in FTR_CREATE, for product type 26B (Inv: Mutual Funds).
 *
 * The FWZZ half is the same flow TC-017's spec proved three times live
 * (classes 300021/300022/300023) - factored out here so a new case does not
 * re-duplicate ~150 lines of dialog-filling logic the way TC-002/TC-008 used
 * to before treasury.ts existed. The FTR_CREATE half is new: nothing in this
 * workspace had driven FTR_CREATE with product type 26B before
 * discover-ftr-26b-*.spec.ts (2026-08-20) mapped it.
 *
 * Same split of responsibility as treasury.ts: these functions perform a step
 * and report what SAP did; the spec decides what counts as a pass.
 */
import type { Page } from '@playwright-sap/test';
import {
  openTransaction, field, setField, setFieldVerified, pressKey, settle,
  readPopup, statusMessage, dismissLiveSearch, clickButton, captureEvidence,
} from '../webgui';
import {
  screen, openScreen, awaitScreen, mSet, mRead, mClick, mReadOptional,
} from '../screens';
import { assertDevSystem } from './session';
import { journal } from '../journal';

export type StepCtx = {
  note: (s: string) => void;
  tag: string;
};

/**
 * Is a `readPopup()` hit just the WebGUI sidebar's System Info panel?
 *
 * `readPopup` matches any `[id^="M1:"]` element, and this panel apparently
 * carries that prefix transiently right after Create (F5)'s screen reload -
 * confirmed live, identically, on both TC-017 and TC-019's clean runs: no
 * message, no buttons, just System/Client/User/Screen/Transaction/timings.
 * Logging that as a deviation is itself slightly inaccurate (nothing
 * happened that needed handling) and it is what has kept two otherwise-clean
 * runs from ever counting toward the freeze gate - `checkSuite.ps1` refuses
 * to count a PASS run that records one. A *real* popup always carries either
 * a button or text beyond this fixed set of labels, so this stays strict.
 */
function isSystemInfoOnly(pop: { text: string; buttons: Array<{ id: string }> }): boolean {
  if (pop.buttons.length > 0) return false;
  const stripped = pop.text.replace(
    /System|Client|User|Screen|Transaction|E2E Time|WebGUI Time|DS4 \(100\)|FS_DEV|SAPLFVW4\/0100|FWZZ|\d+\s*ms|100/g,
    '',
  ).replace(/[\s\t]+/g, '');
  return stripped.length === 0;
}

// ------------------------------------------------------------------ FWZZ

export type ClassData = {
  productType: string;
  shortName: string;
  longName: string;
  issuer: string;
  issueCurrency: string;
  /** Basic Data tab, "Issue Start Date". Optional - not every case sets it. */
  issueStartDate?: string;
  /** Basic Data tab, "Nominal Value per Stock (Independent of Currency)". Optional. */
  nominalValue?: string;
};

/** Open FWZZ, press Create (id left blank - internally numbered product types). */
export async function openClassEntry(page: Page, ctx: StepCtx) {
  const entry = screen('fwzz-entry');
  await openScreen(page, entry);
  await assertDevSystem(page, 'FWZZ entry', ctx.note);
  await mClick(page, entry, 'createButton');

  const dialog = screen('fwzz-create-dialog');
  await awaitScreen(page, dialog);
  ctx.note('opened Create Class dialog');
}

/**
 * Fill the Create Class dialog and press Create (F5).
 *
 * Status/Reference radios are left at SAP's own defaults (Active, Without
 * Reference) - this suite's screen-model vocabulary has no radio control
 * kind, and TC-017 proved three times live that the defaults are what this
 * flow wants.
 */
export async function fillCreateDialog(page: Page, data: ClassData, ctx: StepCtx) {
  const dialog = screen('fwzz-create-dialog');
  await mSet(page, dialog, 'productType', data.productType);
  await mSet(page, dialog, 'shortName', data.shortName);
  await mSet(page, dialog, 'longName', data.longName);

  const productTypeBack = await mRead(page, dialog, 'productType');
  journal.check('Product Type as typed', data.productType, productTypeBack,
    productTypeBack === data.productType ? 'pass' : 'fail');
  if (productTypeBack !== data.productType) {
    throw new Error(`Product Type read back "${productTypeBack}", expected "${data.productType}"`);
  }

  await mClick(page, dialog, 'createConfirmButton');
  await settle(page, 30_000);

  const pop = await readPopup(page).catch(() => null);
  if (pop && !isSystemInfoOnly(pop)) {
    journal.deviation(`unexpected popup right after Create (F5): ${pop.text.slice(0, 300)}`);
    const cont = pop.buttons.find((b) => /continue/i.test(b.title ?? b.text ?? ''));
    if (cont) {
      await page.locator(`[id="${cont.id}"]`).click({ timeout: 15_000 });
      await settle(page, 20_000);
    }
  }

  const master = screen('fwzz-class-master');
  await awaitScreen(page, master);
  ctx.note('class master opened (Search Terms tab)');
}

/** Switch to Basic Data, fill Issuer + Issue Currency, read them back. */
export async function fillClassBasicData(page: Page, data: ClassData, ctx: StepCtx) {
  const master = screen('fwzz-class-master');
  await mClick(page, master, 'basicDataTab');
  await settle(page, 15_000);
  await mSet(page, master, 'issuer', data.issuer);
  await mSet(page, master, 'issueCurrency', data.issueCurrency);
  await pressKey(page, 'Tab');

  const issuerBack = await mRead(page, master, 'issuer');
  journal.check('Issuer as typed', data.issuer, issuerBack,
    issuerBack.trim().startsWith(data.issuer) ? 'pass' : 'fail');
  if (!issuerBack.trim().startsWith(data.issuer)) {
    throw new Error(`Issuer read back "${issuerBack}", expected to start with "${data.issuer}"`);
  }

  const currencyBack = await mRead(page, master, 'issueCurrency');
  journal.check('Issue Currency as typed', data.issueCurrency, currencyBack,
    currencyBack.trim().toUpperCase() === data.issueCurrency ? 'pass' : 'fail');
  ctx.note(`Basic Data filled: issuer ${issuerBack}, currency ${currencyBack}`);

  if (data.issueStartDate) {
    await mSet(page, master, 'issueStartDate', data.issueStartDate);
    const issueStartBack = await mRead(page, master, 'issueStartDate');
    journal.check('Issue Start Date as typed', data.issueStartDate, issueStartBack,
      issueStartBack.trim() === data.issueStartDate ? 'pass' : 'fail');
  }
  if (data.nominalValue) {
    await mSet(page, master, 'nominalValue', data.nominalValue);
    const nominalBack = await mRead(page, master, 'nominalValue');
    const nominalNum = parseFloat(nominalBack.replace(/[\s,]/g, ''));
    journal.check('Nominal Value as typed', data.nominalValue, nominalBack,
      nominalNum === parseFloat(data.nominalValue) ? 'pass' : 'fail');
  }
}

/** Check (F8) on the class master - validates only, never a save. */
export async function checkClass(page: Page, ctx: StepCtx): Promise<void> {
  const master = screen('fwzz-class-master');
  await mClick(page, master, 'checkButton');
  const popup = await readPopup(page).catch(() => null);
  const text = popup?.text ?? '';
  const consistent = /data is consistent/i.test(text) || !/error/i.test(text);
  journal.check('Check (F8) result', 'no errors', text.slice(0, 500), consistent ? 'pass' : 'fail');
  ctx.note(`Check (F8): ${consistent ? 'clean' : 'PROBLEM - see journal'}`);
  if (!consistent) {
    throw new Error(`Check (F8) reported a problem: ${text.slice(0, 800)}`);
  }
}

/** **WRITE** — Save the class. Returns the server-assigned class id. */
export async function saveClass(page: Page, ctx: StepCtx): Promise<string> {
  const master = screen('fwzz-class-master');
  await mClick(page, master, 'saveButton');
  await settle(page, 30_000);

  const savePopup = await readPopup(page).catch(() => null);
  if (savePopup) {
    const cont = savePopup.buttons.find((b) => /continue/i.test(b.title ?? b.text ?? ''));
    if (cont) {
      await page.locator(`[id="${cont.id}"]`).click({ timeout: 15_000 });
      await settle(page, 20_000);
    }
  }

  const newId = await mRead(page, master, 'idNumber');
  journal.check('ID Number after Save', 'a real assigned id (not the placeholder)', newId,
    newId && newId !== '\\INTERN\\' ? 'pass' : 'fail');
  if (!newId || newId === '\\INTERN\\') {
    throw new Error('Save did not assign a real class id');
  }
  journal.document({
    docType: 'Security Class (FWZZ)', number: newId, lifecycle: ['created'], leftInPlace: true,
  });
  ctx.note(`class ${newId} created`);
  ctx.note(
    `  evidence: ${await captureEvidence(page, `${ctx.tag}-${newId}-1-created`, `Class ${newId} created`)}`,
  );
  return newId;
}

// ---------------------------------------------------------------- FTR_CREATE

export type MutualFundDealSpec = {
  companyCode: string;
  transactionType: string;
  partner: string;
  securitiesAccount: string;
  generalValuationClass: string;
  numberOfUnits: string;
  price: string;
};

/**
 * FTR_CREATE's entry screen for a securities-type product (26B): company
 * code, product type 26B, transaction type, the Security Class ID Number
 * (the id `saveClass` just returned) and a business partner.
 */
export async function openMutualFundDealEntry(
  page: Page, classId: string, spec: MutualFundDealSpec, ctx: StepCtx,
) {
  const entry = screen('ftr-create-entry');
  await openScreen(page, entry);
  await assertDevSystem(page, 'FTR_CREATE entry', ctx.note);

  await mSet(page, entry, 'companyCode', spec.companyCode);
  await dismissLiveSearch(page);
  await mSet(page, entry, 'productType', '26B');
  await dismissLiveSearch(page);
  await mSet(page, entry, 'transactionType', spec.transactionType);
  await dismissLiveSearch(page);
  await mSet(page, entry, 'classId', classId);
  await dismissLiveSearch(page);
  await mSet(page, entry, 'partner', spec.partner);
  await dismissLiveSearch(page);

  ctx.note(`FTR_CREATE entry — co.code ${spec.companyCode}, product 26B, txn type `
    + `${spec.transactionType}, class ${classId}, partner ${spec.partner}`);
  await pressKey(page, 'Enter');

  const deal = screen('ftr-26b-deal');
  await awaitScreen(page, deal, 40_000).catch(async () => {
    const msg = await statusMessage(page).catch(() => '');
    throw new Error(`FTR_CREATE did not reach the 26B deal screen: ${msg}`);
  });
}

export type FilledMutualFundDeal = {
  numberOfUnits: string;
  price: string;
  securitiesAccount: string;
  generalValuationClass: string;
  calculationDate: string;
  paymentDate: string;
  paymentCurrency: string | null;
};

/**
 * Fill the deal screen's Structure tab.
 *
 * `calculationDate`/`paymentDate` are never hardcoded: SAP defaults
 * `Position Value Date` to today on every run, and this reads that value
 * back and reuses it for both other date fields, so the case never goes
 * stale on the day it happens to run.
 */
export async function fillMutualFundDeal(
  page: Page, spec: MutualFundDealSpec, ctx: StepCtx,
): Promise<FilledMutualFundDeal> {
  const deal = screen('ftr-26b-deal');

  const positionValueDate = await mReadOptional(page, deal, 'positionValueDate');
  if (!positionValueDate) {
    throw new Error('Position Value Date was not defaulted by SAP - cannot derive the other dates');
  }
  ctx.note(`Position Value Date (SAP default, reused for calc/payment date): ${positionValueDate}`);

  await mSet(page, deal, 'generalValuationClass', spec.generalValuationClass);
  await mSet(page, deal, 'securitiesAccount', spec.securitiesAccount);
  await mSet(page, deal, 'numberOfUnits', spec.numberOfUnits);
  await mSet(page, deal, 'price', spec.price);
  await mSet(page, deal, 'calculationDate', positionValueDate);
  await mSet(page, deal, 'paymentDate', positionValueDate);
  await pressKey(page, 'Enter');

  const units = await mRead(page, deal, 'numberOfUnits');
  const price = await mRead(page, deal, 'price');
  const secAcct = await mRead(page, deal, 'securitiesAccount');
  const gvc = await mRead(page, deal, 'generalValuationClass');
  const calcDate = await mRead(page, deal, 'calculationDate');
  const payDate = await mRead(page, deal, 'paymentDate');
  const payCcy = await mReadOptional(page, deal, 'paymentCurrency');

  journal.check('Number of Units as typed', spec.numberOfUnits, units);
  journal.check('Price as typed', spec.price, price);
  journal.check('Securities Account as typed', spec.securitiesAccount, secAcct,
    secAcct === spec.securitiesAccount ? 'pass' : 'fail');
  journal.check('General Valuation Class as typed', spec.generalValuationClass, gvc,
    gvc.toLowerCase().includes(spec.generalValuationClass.toLowerCase()) ? 'pass' : 'fail');

  return {
    numberOfUnits: units, price, securitiesAccount: secAcct, generalValuationClass: gvc,
    calculationDate: calcDate, paymentDate: payDate, paymentCurrency: payCcy,
  };
}

/**
 * Check (F6) — validates, never a save.
 *
 * Tolerates exactly one known, non-blocking warning: "No payment details
 * entered for transaction" (confirmed live as a WARNING, not an error, by
 * discover-ftr-26b-deal-final-check.spec.ts). Any other message fails the
 * case rather than being silently accepted.
 */
export async function checkMutualFundDeal(page: Page, ctx: StepCtx): Promise<void> {
  const deal = screen('ftr-26b-deal');
  await mClick(page, deal, 'checkButton');
  const msg = await statusMessage(page).catch(() => '');
  const isKnownWarning = /no payment details entered for transaction/i.test(msg);
  const clean = !msg || isKnownWarning;

  journal.check('Check (F6) result', 'clean, or only the known payment-details warning', msg,
    clean ? 'pass' : 'fail');
  if (isKnownWarning) {
    journal.deviation(`Check (F6): known non-blocking warning - "${msg}"`);
  }
  ctx.note(`Check (F6): "${msg || '(no message)'}"`);
  if (!clean) {
    throw new Error(`Check (F6) reported an unexpected problem: ${msg}`);
  }
}

export type SavedMutualFundDeal = {
  dealNumber: string;
  raw: string;
};

/** A deal number, if SAP's confirmation line names one. */
function extractDealNumber(msg: string): string {
  return /financial transaction\s+(\d{4,12})\s+saved/i.exec(msg)?.[1]
    ?? msg.match(/\b(\d{5,12})\b/)?.[1]
    ?? '';
}

/**
 * **WRITE** — Save the deal.
 *
 * The known "No payment details entered for transaction" warning has to be
 * acknowledged before Save actually commits, and a bare Save press does not
 * do it — confirmed live, 2026-08-20 (discover-ftr-26b-save-twice.spec.ts):
 * pressing the one real Save control three times running left the
 * Transaction field on the internal placeholder every time. The sequence
 * that committed was **Enter, Save, Enter** — the confirmation
 * ("Financial transaction saved under number 23000140") appeared only after
 * the *second* Enter, not after the Save click itself. This runs that exact
 * three-step sequence, checking the status message for a deal number after
 * every step so it stops the moment SAP reports one, rather than assuming
 * which specific step is "the" commit.
 *
 * `mClick` on the Save button is wrapped: once the deal is actually saved,
 * the screen can move on and the button may no longer resolve — a resolution
 * failure at that point is a symptom of success, not a new error, so it is
 * only re-raised if the deal number is still missing afterwards.
 */
export async function saveMutualFundDeal(page: Page, ctx: StepCtx): Promise<SavedMutualFundDeal> {
  const deal = screen('ftr-26b-deal');

  const checkForNumber = async (where: string): Promise<string> => {
    const msg = await statusMessage(page).catch(() => '');
    const n = extractDealNumber(msg);
    ctx.note(`${where}: "${msg}"${n ? ` -> deal ${n}` : ''}`);
    return n;
  };

  await pressKey(page, 'Enter');
  await settle(page, 15_000);
  let dealNumber = await checkForNumber('after Enter (1)');

  if (!dealNumber) {
    try {
      await mClick(page, deal, 'saveButton');
      await settle(page, 30_000);
    } catch (e) {
      journal.deviation(`Save button did not resolve after Enter (1): ${e}`);
    }
    dealNumber = await checkForNumber('after Save');
  }

  if (!dealNumber) {
    await pressKey(page, 'Enter');
    await settle(page, 15_000);
    dealNumber = await checkForNumber('after Enter (2)');
  }

  const finalMsg = await statusMessage(page).catch(() => '');
  journal.check('Save confirmation names the deal', 'Financial transaction <number> saved',
    finalMsg, dealNumber ? 'pass' : 'fail');
  if (!dealNumber) {
    throw new Error(`Save (Enter, Save, Enter) did not report a deal number. SAP said: "${finalMsg}"`);
  }

  journal.document({
    docType: 'Investment Fund transaction (FTR_CREATE, 26B)', number: dealNumber,
    lifecycle: ['created'], leftInPlace: true,
  });
  ctx.note(`deal ${dealNumber} created`);
  ctx.note(
    `  evidence: ${await captureEvidence(page, `${ctx.tag}-${dealNumber}-2-created`, `Deal ${dealNumber} created`)}`,
  );
  return { dealNumber, raw: finalMsg };
}
