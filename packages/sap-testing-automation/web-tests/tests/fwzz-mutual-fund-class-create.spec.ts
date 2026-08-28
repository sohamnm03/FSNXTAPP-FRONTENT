import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect } from '../fixtures';
import {
  openTransaction, screenInfo, setFieldVerified, pressKey,
  settle, readPopup, dumpOnFailure, writeArtifact, captureEvidence,
} from '../webgui';
import {
  screen, openScreen, awaitScreen, mSet, mRead, mClick,
} from '../screens';
import { journal } from '../journal';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * TC-017 - FWZZ: create a Class for product type 26B (Inv: Mutual Funds).
 *
 * WRITES TO THE DATABASE. Pressing Save on the class master commits one new
 * Class on DS4/100. Confirmed by the human before the run - see the case
 * file's Writes section.
 *
 * The route and every mandatory field below came from live discovery, not
 * guesswork (CLAUDE.md rule 4):
 *  - discover-fwzz-26b-class.spec.ts: FWZZ's entry screen carries exactly one
 *    input (Security Class ID Number) - no product type field there.
 *  - discover-fwzz-26b-create-panel.spec.ts: Create opens a modal dialog
 *    ("Create Class") that asks for Product Type / Short Name / Long Name.
 *  - discover-fwzz-26b-master.spec.ts: typing an id for 26B is refused -
 *    "Numbers assigned to product type 26B internally (do not enter an ID
 *    number)". Leaving it blank opens the class master on "Search Terms";
 *    switching tabs away from "Basic Data" is blocked once visited, by
 *    "Make an entry in mandatory field \"Issuer\"".
 *  - discover-fwzz-26b-check.spec.ts: Check (F8) - a validate-only action,
 *    never a save - names the exact requirement: Issuer and Issue Currency
 *    are both mandatory on Basic Data.
 *  - discover-fwzz-26b-issuer.spec.ts: Issuer Identity Key's own F4 returns
 *    0 rows even with every filter cleared - no Business Partner carries
 *    role TR0150 by default lookup.
 *  - discover-fwzz-26b-issuer-typed.spec.ts: typed directly (the same
 *    strategy probe-security-class.spec.ts used for a different empty F4),
 *    400000003 (a BP used elsewhere in this suite as a plain deal
 *    counterparty) is refused - "does not exist in role TR0150" - but
 *    700000453 resolves to "TATA FIN PVT.LTD / MUMBAI 400021" and Check (F8)
 *    reports "Data is consistent". That is the Issuer this case uses.
 *
 * The Status/Reference radio buttons are left at their SAP defaults (Active,
 * Without Reference) - this suite's screen-model vocabulary has no radio
 * control kind, and the defaults are what this case wants anyway.
 *
 *   entry  - open FWZZ, stop before Create                        (no write)
 *   dialog - fill the Create Class dialog, stop before Create(F5) (no write)
 *   basic  - open the class master, fill Basic Data, Check only   (no write)
 *   save   - press Save                                           WRITE 1
 *
 *   $env:FLOW_STAGE="save"
 */

const STAGES = ['entry', 'dialog', 'basic', 'save'] as const;
type Stage = (typeof STAGES)[number];

const STAGE = (process.env.FLOW_STAGE ?? 'entry') as Stage;
if (!STAGES.includes(STAGE)) {
  throw new Error(`FLOW_STAGE='${STAGE}' is not one of: ${STAGES.join(', ')}`);
}
const upTo = (s: Stage) => STAGES.indexOf(STAGE) >= STAGES.indexOf(s);

type Row = { id: string; label: string; shortName: string; longName: string };
type DatasetFile = {
  id: string;
  case: string;
  system?: string;
  defaults: { productType: string; issuer: string; issueCurrency: string };
  rows: Row[];
};

function loadRow(): { row: Row; defaults: DatasetFile['defaults']; datasetId: string } {
  const path = resolve(repoRoot, 'test-data', 'fwzz-mutual-fund-class.dataset.json');
  const ds: DatasetFile = JSON.parse(readFileSync(path, 'utf8'));
  const wanted = process.env.DATASET_ROWS ?? 'baseline';
  const row = ds.rows.find((r) => r.id === wanted);
  if (!row) {
    throw new Error(`DATASET_ROWS='${wanted}' not in fwzz-mutual-fund-class. Known: ${ds.rows.map((r) => r.id).join(', ')}`);
  }
  return { row, defaults: ds.defaults, datasetId: ds.id };
}

const { row, defaults, datasetId } = loadRow();

test.afterEach(async ({ sapPage }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await dumpOnFailure(sapPage, `tc-017-${STAGE}`);
  }
});

test(`TC-017 FWZZ create class, product type ${defaults.productType} (stage=${STAGE}, row=${row.id})`, async ({ sapPage }) => {
  test.setTimeout(300_000);

  journal.forCase('TC-017');
  journal.meta('stage', STAGE);
  journal.meta('dataset row', `${datasetId}/${row.id}`);

  // ============================================================ FWZZ entry
  const entryModel = screen('fwzz-entry');
  await openScreen(sapPage, entryModel);
  const info = await screenInfo(sapPage);
  journal.systemConfirmed('FWZZ entry', {
    system: info.system, client: info.client, user: info.user,
    confirmed: info.system.includes('DS4') && info.client.includes('100'),
  });
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');
  journal.step('opened FWZZ entry screen', 'ok');

  if (!upTo('dialog')) {
    journal.step('STAGE=entry - stopping before Create. Nothing written.', 'skipped');
    return;
  }

  // ----------------------------------------------------- Create Class dialog
  await mClick(sapPage, entryModel, 'createButton');
  const dialogModel = screen('fwzz-create-dialog');
  await awaitScreen(sapPage, dialogModel);
  journal.step('opened Create Class dialog', 'ok');

  await mSet(sapPage, dialogModel, 'productType', defaults.productType);
  await mSet(sapPage, dialogModel, 'shortName', row.shortName);
  await mSet(sapPage, dialogModel, 'longName', row.longName);

  const productTypeBack = await mRead(sapPage, dialogModel, 'productType');
  journal.check('Product Type as typed', defaults.productType, productTypeBack,
    productTypeBack === defaults.productType ? 'pass' : 'fail');
  expect(productTypeBack).toBe(defaults.productType);

  if (!upTo('basic')) {
    journal.step('STAGE=dialog - stopping before Create (F5). Nothing written.', 'skipped');
    return;
  }

  // ------------------------------------------------- Create (F5) -> master
  await mClick(sapPage, dialogModel, 'createConfirmButton');
  await settle(sapPage, 30_000);

  // The internal-numbering info popup only appears if an id was typed - this
  // case never types one, but handle it defensively rather than assume.
  //
  // `readPopup` also fires here on the WebGUI sidebar's System Info panel
  // (no message, no buttons - confirmed live on two prior PASS runs,
  // 2026-08-19/20), which is not a real popup and was the reason both runs
  // recorded a spurious deviation and never counted toward the freeze gate.
  const pop = await readPopup(sapPage).catch(() => null);
  const isSystemInfoOnly = pop
    && pop.buttons.length === 0
    && pop.text.replace(
      /System|Client|User|Screen|Transaction|E2E Time|WebGUI Time|DS4 \(100\)|FS_DEV|SAPLFVW4\/0100|FWZZ|\d+\s*ms|100/g,
      '',
    ).replace(/[\s\t]+/g, '').length === 0;
  if (pop && !isSystemInfoOnly) {
    journal.deviation(`unexpected popup right after Create (F5): ${pop.text.slice(0, 300)}`);
    const cont = pop.buttons.find((b) => /continue/i.test(b.title ?? b.text ?? ''));
    if (cont) {
      await sapPage.locator(`[id="${cont.id}"]`).click({ timeout: 15_000 });
      await settle(sapPage, 20_000);
    }
  }

  const masterModel = screen('fwzz-class-master');
  await awaitScreen(sapPage, masterModel);
  journal.step('class master opened (Search Terms tab)', 'ok');

  const idPlaceholder = await mRead(sapPage, masterModel, 'idNumber');
  journal.check('ID Number before Save', '\\INTERN\\ (placeholder)', idPlaceholder);
  expect(idPlaceholder).toBe('\\INTERN\\');

  // ---- Basic Data: Issuer + Issue Currency ----
  await mClick(sapPage, masterModel, 'basicDataTab');
  await settle(sapPage, 15_000);
  await mSet(sapPage, masterModel, 'issuer', defaults.issuer);
  await mSet(sapPage, masterModel, 'issueCurrency', defaults.issueCurrency);
  await pressKey(sapPage, 'Tab');

  const issuerBack = await mRead(sapPage, masterModel, 'issuer');
  journal.check('Issuer as typed', defaults.issuer, issuerBack,
    issuerBack.trim().startsWith(defaults.issuer) ? 'pass' : 'fail');
  expect(issuerBack.trim()).toContain(defaults.issuer);

  const currencyBack = await mRead(sapPage, masterModel, 'issueCurrency');
  journal.check('Issue Currency as typed', defaults.issueCurrency, currencyBack,
    currencyBack.trim().toUpperCase() === defaults.issueCurrency ? 'pass' : 'fail');
  expect(currencyBack.trim().toUpperCase()).toBe(defaults.issueCurrency);

  await captureEvidence(sapPage, 'tc-017-basic-data-filled', 'Basic Data tab filled, before Check');

  // ---- Check (F8): validate, never a save ----
  await mClick(sapPage, masterModel, 'checkButton');
  const checkPopup = await readPopup(sapPage).catch(() => null);
  const checkText = checkPopup?.text ?? '';
  const consistent = /data is consistent/i.test(checkText) || !/error/i.test(checkText);
  journal.check('Check (F8) result', 'no errors', checkText.slice(0, 500), consistent ? 'pass' : 'fail');
  if (!consistent) {
    journal.deviation(`Check (F8) reported a problem: ${checkText.slice(0, 800)}`);
  }
  expect(checkText, `Check (F8) must report no errors before Save: ${checkText}`).not.toMatch(/error/i);

  if (!upTo('save')) {
    journal.step('STAGE=basic - stopping before Save. Nothing written.', 'skipped');
    return;
  }

  // ============================================================ WRITE 1
  await mClick(sapPage, masterModel, 'saveButton');
  await settle(sapPage, 30_000);

  const savePopup = await readPopup(sapPage).catch(() => null);
  if (savePopup) {
    journal.step('popup after Save', 'ok', savePopup.text.slice(0, 400));
    const cont = savePopup.buttons.find((b) => /continue/i.test(b.title ?? b.text ?? ''));
    if (cont) {
      await sapPage.locator(`[id="${cont.id}"]`).click({ timeout: 15_000 });
      await settle(sapPage, 20_000);
    }
  }

  // The id field now carries the server-assigned number, not the placeholder.
  const newId = await mRead(sapPage, masterModel, 'idNumber');
  journal.check('ID Number after Save', 'a real assigned id (not the placeholder)', newId,
    newId && newId !== '\\INTERN\\' ? 'pass' : 'fail');
  expect(newId, 'a real class id must have been assigned').not.toBe('\\INTERN\\');
  expect(newId).toMatch(/\S/);

  journal.document({
    docType: 'Security Class (FWZZ)',
    number: newId,
    lifecycle: ['created'],
    leftInPlace: true,
    note: `product type ${defaults.productType}, issuer ${defaults.issuer}, currency ${defaults.issueCurrency}`,
  });

  writeArtifact('tc-017-class-id.txt', newId);
  await captureEvidence(sapPage, 'tc-017-after-save', `class ${newId} created`);

  // ---- re-verify by a fresh Display, not by trusting the live screen ----
  // Short Name lives on "Search Terms" (the master's default tab on open);
  // Issuer lives on "Basic Data" - read each while on the tab that actually
  // carries it, rather than clicking Basic Data first and losing Short Name.
  await openTransaction(sapPage, 'FWZZ');
  await setFieldVerified(sapPage, 'Security Class ID Number', newId);
  await mClick(sapPage, entryModel, 'displayButton');
  await settle(sapPage, 20_000);

  const verifyShort = await mRead(sapPage, masterModel, 'shortName').catch(() => null);

  await mClick(sapPage, masterModel, 'basicDataTab').catch(() => {});
  await settle(sapPage, 15_000);
  const verifyIssuer = await mRead(sapPage, masterModel, 'issuer').catch(() => null);
  journal.check('Short Name persisted (re-Display)', row.shortName, verifyShort,
    verifyShort === row.shortName ? 'pass' : 'fail');
  journal.check('Issuer persisted (re-Display)', defaults.issuer, verifyIssuer,
    (verifyIssuer ?? '').includes(defaults.issuer) ? 'pass' : 'fail');

  expect(verifyShort).toBe(row.shortName);
  expect(verifyIssuer ?? '').toContain(defaults.issuer);

  journal.verdict('PASS', `Class ${newId} created and re-verified by fresh Display.`);
  console.log(`--- class ${newId} created ---`);
});
