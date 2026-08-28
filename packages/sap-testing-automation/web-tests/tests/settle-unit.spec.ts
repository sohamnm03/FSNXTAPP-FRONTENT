import { test, expect } from '@playwright-sap/test';
import { settle } from '../webgui';

/**
 * Offline unit tests for `settle()` - no SAP connection required.
 *
 * `settle` decides when an ITS round trip is over. Getting it wrong is
 * expensive in both directions: return too early and steps race the screen,
 * return too late and every step pays for it. These pin both edges against a
 * local page, so the behaviour can be checked without a VPN.
 */

test('returns quickly when the page is already static', async ({ page }) => {
  await page.setContent('<body><p>static screen</p></body>');
  const t0 = Date.now();
  await settle(page);
  const elapsed = Date.now() - t0;
  console.log(`settle elapsed: ${elapsed} ms`);

  expect(elapsed, 'a static page should not cost seconds').toBeLessThan(2000);
});

test('waits for a DOM that is still changing, then returns', async ({ page }) => {
  // Mutates for ~1.2s, then stops - stands in for a screen ITS is repainting.
  await page.setContent(`
    <body><div id="out"></div>
    <script>
      let n = 0;
      const timer = setInterval(() => {
        document.getElementById('out').insertAdjacentHTML('beforeend', '<p>row ' + (++n) + '</p>');
        if (n >= 12) clearInterval(timer);
      }, 100);
    </script></body>
  `);

  const t0 = Date.now();
  await settle(page);
  const elapsed = Date.now() - t0;
  console.log(`settle elapsed: ${elapsed} ms`);

  const rows = await page.locator('#out p').count();
  expect(rows, 'must not return mid-repaint').toBe(12);
  expect(elapsed, 'should wait out the churn').toBeGreaterThan(1000);
  expect(elapsed, 'but should not linger long after it stops').toBeLessThan(4000);
});

test('honours maxMs on a page that never settles', async ({ page }) => {
  await page.setContent(`
    <body><div id="out"></div>
    <script>
      setInterval(() => {
        document.getElementById('out').insertAdjacentHTML('beforeend', '<p>x</p>');
      }, 80);
    </script></body>
  `);

  const t0 = Date.now();
  await settle(page, 2500);
  const elapsed = Date.now() - t0;
  console.log(`settle elapsed: ${elapsed} ms`);

  expect(elapsed, 'must give up at maxMs, not hang the suite').toBeGreaterThanOrEqual(2400);
  expect(elapsed).toBeLessThan(5000);
});
