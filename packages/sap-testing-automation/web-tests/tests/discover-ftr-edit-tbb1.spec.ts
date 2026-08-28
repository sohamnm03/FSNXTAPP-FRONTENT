import { test, expect } from '../fixtures';
import { openTransaction, dumpScreen, screenInfo, bodyText, writeArtifact } from '../webgui';

/**
 * Read-only discovery of the two screens TC-002 still has to drive: the
 * FTR_EDIT initial screen and the TBB1 selection screen.
 *
 * NOTHING IS WRITTEN. Each transaction is opened and its entry screen dumped;
 * no field is filled, no Enter is pressed, nothing is executed. This exists so
 * the settle and post steps can address fields by discovered `title` rather
 * than by a guessed id (CLAUDE.md non-negotiable #4).
 */

test('discover FTR_EDIT and TBB1 entry screens (read-only)', async ({ sapPage }) => {
  test.setTimeout(300_000);

  for (const tcode of ['FTR_EDIT', 'TBB1']) {
    await openTransaction(sapPage, tcode);

    const info = await screenInfo(sapPage);
    console.log(`${tcode}: ${JSON.stringify(info)}`);
    expect(info.system, 'must be DS4').toContain('DS4');
    expect(info.client, 'must be client 100').toContain('100');

    await dumpScreen(sapPage, `discover-${tcode}`);
    writeArtifact(`discover-${tcode}-text.txt`, await bodyText(sapPage));

    // dumpScreen queries input/select/textarea/button/[role=button]/[role=tab],
    // so Dynpro checkboxes - which ITS renders as [role="checkbox"] divs - are
    // invisible to it. TBB1's Test Run flag is one of those, and posting with it
    // in the wrong state either writes nothing or writes when it shouldn't.
    const checks = await sapPage.evaluate(() => {
      const out: Record<string, unknown>[] = [];
      document.querySelectorAll('[role="checkbox"], [role="radio"], input[type="checkbox"]').forEach((el) => {
        const e = el as HTMLElement;
        const box = e.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) return;
        out.push({
          id: e.id,
          role: e.getAttribute('role'),
          checked: e.getAttribute('aria-checked') ?? (e as HTMLInputElement).checked,
          title: e.title || '',
          text: (e.textContent ?? '').trim().slice(0, 45),
          label: (e.getAttribute('aria-label') ?? '').slice(0, 45),
        });
      });
      return out;
    });
    console.log(`${tcode} CHECKBOXES:\n${checks.map((c) => JSON.stringify(c)).join('\n')}`);
    writeArtifact(`discover-${tcode}-checkboxes.txt`, checks.map((c) => JSON.stringify(c)).join('\n'));

    // Both duplicate-titled fields, in document order, so the settle/post steps
    // can address them by index instead of by a .first() that picks the wrong one.
    const dupes = await sapPage.evaluate(() => {
      const out: Record<string, unknown>[] = [];
      document.querySelectorAll('input[title]').forEach((el, i) => {
        const e = el as HTMLInputElement;
        const box = e.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) return;
        out.push({ order: i, id: e.id, title: e.title, value: e.value, y: Math.round(box.y), x: Math.round(box.x) });
      });
      return out;
    });
    writeArtifact(`discover-${tcode}-inputs-ordered.txt`, dupes.map((d) => JSON.stringify(d)).join('\n'));
  }
});
