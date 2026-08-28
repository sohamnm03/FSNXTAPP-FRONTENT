import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, screenInfo, clickButton, bodyText,
  handleKnownPopups, writeArtifact, captureEvidence,
} from '../webgui';

/** READ-ONLY probe: TBB1 test run, company code 9999 only, no deal filter. */

const SAFE_POPUP = /working day|not a working day|adopt date|arbeitstag|posting log|logs and messages/i;

const CO_CODE = (process.env.CO_CODE ?? '9999').trim();
const DEAL = (process.env.DEAL ?? '').trim();

test(`PROBE: TBB1 test run, company code ${CO_CODE}${DEAL ? ' deal ' + DEAL : ' (no deal filter)'}`, async ({ sapPage }) => {
  test.setTimeout(120_000);
  await openTransaction(sapPage, 'TBB1');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await setFieldVerified(sapPage, 'Company Code', CO_CODE);
  if (DEAL) await setFieldVerified(sapPage, 'Financial Transaction', DEAL, 0);
  // Test Run Indicator (M0:46:::31:5) already defaults true - leave it.
  await clickButton(sapPage, 'M0:50::btn[8]', 60_000);
  await handleKnownPopups(sapPage, SAFE_POPUP, (s) => console.log(s));

  const text = await bodyText(sapPage);
  writeArtifact(`probe-tbb1-select-${CO_CODE}-${DEAL || 'nofilter'}.txt`, text);
  await captureEvidence(sapPage, `probe-tbb1-select-${CO_CODE}-${DEAL || 'nofilter'}`);
  console.log(text.slice(0, 4000));
});
