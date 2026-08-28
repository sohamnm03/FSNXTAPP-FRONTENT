import { test, expect } from '../fixtures';
import { openTransaction, setFieldVerified, screenInfo, dumpScreen } from '../webgui';

/** READ-ONLY probe: TBB1 selection screen field layout for co.code 9999. */

test('PROBE: TBB1 selection screen fields (9999)', async ({ sapPage }) => {
  test.setTimeout(120_000);
  await openTransaction(sapPage, 'TBB1');
  const info = await screenInfo(sapPage);
  expect(info.system).toContain('DS4');
  expect(info.client).toContain('100');

  await setFieldVerified(sapPage, 'Company Code', '9999');
  const dump = await dumpScreen(sapPage, 'tbb1-fields-9999', { full: true });
  console.log(JSON.stringify(dump.controls.filter((c: any) => c.isInput), null, 2));

  const checks = await sapPage.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[role="checkbox"], [role="radio"]'));
    return els.map((el) => {
      let label = '';
      let node: HTMLElement | null = el.parentElement as HTMLElement | null;
      for (let i = 0; i < 4 && node && !label; i++) {
        label = (node.previousElementSibling as HTMLElement | null)?.innerText?.trim() ?? '';
        node = node.parentElement;
      }
      return {
        id: el.id,
        role: el.getAttribute('role'),
        checked: el.getAttribute('aria-checked'),
        title: (el as HTMLElement).title ?? '',
        nearbyLabel: label,
      };
    });
  });
  console.log('CHECKBOXES/RADIOS:', JSON.stringify(checks, null, 2));
});
