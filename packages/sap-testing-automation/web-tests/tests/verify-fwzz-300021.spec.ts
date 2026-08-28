import { test, expect } from '../fixtures';
import { openTransaction, screenInfo, setFieldVerified } from '../webgui';
import { screen, openScreen, mClick, mRead } from '../screens';

/**
 * READ-ONLY: checks the current state of Class 300021, created by TC-017's
 * write run (results/TC-017-2026-08-19-2307.md). That run's own post-write
 * verification step read Short Name while sitting on the Basic Data tab -
 * Short Name only exists on Search Terms, so it read null and the run
 * reported FAIL even though the write itself succeeded (the class master
 * screen title changed from "Create Class" to "Change Class" with id
 * 300021, and Issuer read back correctly). This does not touch the write
 * path - it only reads, confirming what actually persisted rather than
 * trusting the earlier run's own buggy assertion.
 */

test('VERIFY: current state of Class 300021 (FWZZ, product type 26B)', async ({ sapPage }) => {
  test.setTimeout(120_000);

  const entryModel = screen('fwzz-entry');
  await openScreen(sapPage, entryModel);
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await setFieldVerified(sapPage, 'Security Class ID Number', '300021');
  await mClick(sapPage, entryModel, 'displayButton');

  const masterModel = screen('fwzz-class-master');
  const shortName = await mRead(sapPage, masterModel, 'shortName');
  const longName = await mRead(sapPage, masterModel, 'longName');
  const productType = await mRead(sapPage, masterModel, 'productType');
  console.log(`Class 300021 - Search Terms: shortName="${shortName}" longName="${longName}" productType="${productType}"`);

  await mClick(sapPage, masterModel, 'basicDataTab');
  const issuer = await mRead(sapPage, masterModel, 'issuer');
  const issueCurrency = await mRead(sapPage, masterModel, 'issueCurrency');
  console.log(`Class 300021 - Basic Data: issuer="${issuer}" issueCurrency="${issueCurrency}"`);

  expect(shortName).toBe('NIFTY50 IDX FUN');
  expect(longName).toBe('NIIF Nifty 50 Index Fund - Growth');
  expect(productType).toBe('26B');
  expect(issuer).toContain('700000453');
  expect(issueCurrency.trim().toUpperCase()).toBe('INR');
});
