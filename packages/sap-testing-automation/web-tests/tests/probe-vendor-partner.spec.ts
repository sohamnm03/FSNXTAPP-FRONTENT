import { test, expect } from '../fixtures';
import {
  openTransaction, setFieldVerified, pressKey, screenInfo, setField,
  writeArtifact, bodyText, settle,
} from '../webgui';

/**
 * READ-ONLY-ish probe: does ANY business partner number already used
 * elsewhere in this workspace's data (400000003, 700000046 - seen attached to
 * debenture security classes) carry a Vendor role, so it can be typed into
 * "Beneficiary" on the 38A LC screen? Its own F4 returns 0 rows even with
 * every filter cleared, so this tries known candidates directly and reads
 * whichever error (or lack of one) comes back - Enter does not save.
 */

test.skip(process.env.DISCOVER !== '1', 'probe - run with DISCOVER=1');

const CANDIDATES = (process.env.CANDIDATES ?? '700000046,400000001,400000002,400000004,400000005')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

test('PROBE: vendor-role candidates for Beneficiary on 38A/100', async ({ sapPage }) => {
  test.setTimeout(600_000);

  const results: string[] = [];
  for (const cand of CANDIDATES) {
    await openTransaction(sapPage, 'FTR_CREATE');
    const info = await screenInfo(sapPage);
    expect(info.system).toContain('DS4');
    expect(info.client).toContain('100');

    await setFieldVerified(sapPage, 'Company Code', '9800');
    await setFieldVerified(sapPage, 'Product Type', '38A');
    await setFieldVerified(sapPage, 'Financial Transaction Type', '100');
    await setFieldVerified(sapPage, 'Business Partner Number', '400000003');
    await pressKey(sapPage, 'Enter');

    await setField(sapPage, 'Beneficiary', cand);
    await pressKey(sapPage, 'Enter');
    await settle(sapPage, 8000);

    const text = await bodyText(sapPage);
    const errLine = text.split('\n').map((l) => l.trim()).find((l) => /^Error:/i.test(l));
    const line = `${cand}: ${errLine ?? 'no error - accepted'}`;
    results.push(line);
    console.log(line);
  }

  writeArtifact('probe-vendor-candidates.txt', results.join('\n'));
});
