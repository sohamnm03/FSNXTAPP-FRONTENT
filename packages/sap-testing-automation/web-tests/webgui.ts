import type { Page } from '@playwright-sap/test';
import { writeFileSync, readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sapSystem } from './sap-system';
import { journal } from './journal';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Helpers for driving a classic Dynpro transaction through the ITS WebGUI.
 *
 * ITS ids are positional (`M0:46:::0:24`) and change from screen to screen, so
 * nothing here addresses a field by id. Every input carries a `title` holding
 * the field's screen label, which is stable and readable - that is the handle
 * used throughout. Discover the titles with `dumpScreen` before writing steps.
 */

/**
 * In-flight request counter, so `settle` can tell "SAP has not answered yet"
 * from "SAP answered and the screen is done".
 */
type Traffic = { inFlight: number; lastActivity: number };
const traffic = new WeakMap<Page, Traffic>();

export function trackRequests(page: Page) {
  if (traffic.has(page)) return;
  const t: Traffic = { inFlight: 0, lastActivity: Date.now() };
  traffic.set(page, t);
  page.on('request', () => {
    t.inFlight++;
    t.lastActivity = Date.now();
  });
  const done = () => {
    t.inFlight = Math.max(0, t.inFlight - 1);
    t.lastActivity = Date.now();
  };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
}

/**
 * Wait for an ITS round trip to finish - adaptively, not on a fixed sleep.
 *
 * SAP answers these screens in 200-800 ms (its own `E2E Time` readout), so a
 * flat 3-6 s sleep per step wasted ~100 s over a 30-step flow *and* was still
 * a guess: a slow screen could outrun it and produce a phantom failure.
 *
 * Two conditions must both hold: no HTTP request in flight, and the DOM has
 * stopped changing for two consecutive samples. The request check stops us
 * declaring victory in the gap after a click but before SAP replies, when the
 * DOM is trivially "stable" because nothing has happened yet.
 */
export async function settle(page: Page, maxMs = 25_000) {
  trackRequests(page); // idempotent; safe if the caller never opened a tcode
  const t = traffic.get(page);
  const start = Date.now();
  const quietFor = 250;

  // Let the click/keypress actually dispatch its request before judging.
  await page.waitForTimeout(120);
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  let lastSig = '';
  let stableSamples = 0;

  while (Date.now() - start < maxMs) {
    const networkQuiet = !t || (t.inFlight === 0 && Date.now() - t.lastActivity > quietFor);

    if (networkQuiet) {
      const sig = await page
        .evaluate(() => {
          const b = document.body;
          if (!b) return '';
          // Cheap fingerprint: text length + node count. Both move on any ITS
          // repaint; neither churns on its own the way innerHTML would.
          return `${(b.innerText ?? '').length}:${document.getElementsByTagName('*').length}`;
        })
        .catch(() => '');

      if (sig !== '' && sig === lastSig) {
        stableSamples++;
        if (stableSamples >= 2) return;
      } else {
        stableSamples = 0;
        lastSig = sig;
      }
    } else {
      stableSamples = 0;
    }

    await page.waitForTimeout(120);
  }
  // Timed out waiting for quiet. Not fatal on its own - the caller's own
  // assertions decide whether the screen is usable.
}

export async function openTransaction(page: Page, tcode: string) {
  trackRequests(page);
  await page.goto(`${sapSystem.webguiUrl}&~transaction=${tcode}`, {
    waitUntil: 'domcontentloaded',
  });
  await settle(page);
}

/**
 * Locator for an input by its screen label (the `title` attribute).
 *
 * `nth` disambiguates repeated labels, which are not rare: TBB1 carries two
 * inputs titled "Posting Date in the Document" - a selection filter ("Up to and
 * Incl. Posting Date") and the Posting Control date that actually stamps the
 * document. Defaulting to `.first()` would silently pick the filter and post
 * under today's date instead of the requested one, with nothing on screen to
 * show for it. Discover the order with an ordered-input dump before choosing.
 */
export function field(page: Page, title: string, nth = 0) {
  return page.locator(`input[title="${title}"]`).nth(nth);
}

/**
 * Type a value into a field. Uses real typing rather than fill(): ITS input
 * fields carry key handlers that a direct value assignment bypasses, which
 * leaves the server-side value empty while the screen looks correct.
 */
export async function setField(page: Page, title: string, value: string, nth = 0) {
  const el = field(page, title, nth);
  await el.click();
  await el.press('Control+a');
  await el.pressSequentially(value, { delay: 30 });
}

export async function readField(page: Page, title: string, nth = 0): Promise<string> {
  return field(page, title, nth).inputValue();
}

/**
 * Type a value and prove it arrived, retrying if it did not.
 *
 * ITS intermittently drops leading keystrokes when a field re-renders while it
 * has focus: entering "200105" into FTR_EDIT's transaction field produced
 * "00105" on one run and the correct value on the next. For an identifier that
 * is not cosmetic - it selects a *different, real* transaction, so a settle or
 * a post would silently hit the wrong deal.
 *
 * Only for fields SAP does not reformat: identifiers, dates, company codes. An
 * amount comes back as "100,000.00" and a rate as "10.0000000", so those keep
 * plain `setField` and are checked numerically by the caller instead.
 */
export async function setFieldVerified(
  page: Page,
  title: string,
  value: string,
  nth = 0,
  attempts = 3,
) {
  let got = '';
  for (let i = 0; i < attempts; i++) {
    const el = field(page, title, nth);
    await el.click();
    await el.press('Control+a');
    await el.press('Delete');
    await el.pressSequentially(value, { delay: 40 });

    got = (await el.inputValue()).trim();
    if (got === value) return;
  }
  throw new Error(
    `field "${title}"[${nth}]: typed "${value}" but the field holds "${got}" after ${attempts} attempts`,
  );
}

/**
 * Choose an entry in a Dynpro dropdown list box, and prove it landed.
 *
 * These are NOT text fields and cannot be typed into. ITS renders them as
 *   <input ct="CB" readonly aria-haspopup="true"
 *          aria-roledescription="Dropdown List Box"
 *          aria-controls="<listbox id>">
 * so `setField` fails on them - measured: `locator.click` times out and
 * `pressSequentially` could never write to a readonly input anyway.
 *
 * The option list lives in the DOM before the field is ever opened, under the
 * id named by `aria-controls`, as `[role="option"]` divs. Scoping the search to
 * that listbox matters: several dropdowns on one screen all render their
 * options into the page, and a document-wide text match can pick an entry
 * belonging to a different field.
 *
 * Selecting fires a server round trip, and the screen can grow fields as a
 * result (choosing a periodic interest frequency reveals the frequency count
 * and unit), so the value is re-read through `field()` afterwards rather than
 * from a stale handle.
 */
export async function selectDropdown(
  page: Page,
  title: string,
  optionText: string,
  nth = 0,
) {
  const el = field(page, title, nth);
  await el.waitFor({ state: 'attached', timeout: 15_000 });

  const listId = await el.getAttribute('aria-controls');
  if (!listId) {
    throw new Error(
      `field "${title}"[${nth}] is not a dropdown list box (no aria-controls) - use setField instead`,
    );
  }

  /** Is the field's own option list actually on screen? */
  const listOpen = async () =>
    page.evaluate((id) => {
      const list = document.getElementById(id);
      if (!list) return false;
      const r = list.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }, listId);

  // Opening is not uniform across these controls, which is worth knowing before
  // debugging one: a force-click on the input opens "Frequency Indicator" but
  // NOT "Term Category" (measured - display stays `none`, so the options are in
  // the DOM but unclickable, and the failure reads as "Element is not visible"
  // on the option rather than on the field). Alt+ArrowDown - the standard
  // combobox gesture - opens both, so the click is only the first attempt.
  await el.click({ force: true, timeout: 10_000 }).catch(() => {});
  await settle(page, 6000);

  if (!(await listOpen())) {
    await el.press('Alt+ArrowDown').catch(() => {});
    await settle(page, 6000);
  }

  if (!(await listOpen())) {
    throw new Error(
      `dropdown "${title}"[${nth}]: could not open its option list (${listId}) by click or Alt+ArrowDown`,
    );
  }

  const found = await page.evaluate(
    ({ id, want }) => {
      const list = document.getElementById(id);
      if (!list) return { optId: null as string | null, available: [] as string[] };
      const opts = Array.from(list.querySelectorAll('[role="option"]'));
      const available = opts.map((o) => (o.textContent ?? '').trim());
      const hit = opts.find(
        (o) => (o.textContent ?? '').trim().toLowerCase() === want.trim().toLowerCase(),
      );
      return { optId: hit ? hit.id : null, available };
    },
    { id: listId, want: optionText },
  );

  if (!found.optId) {
    throw new Error(
      `dropdown "${title}": no option "${optionText}". Available: ${JSON.stringify(found.available)}`,
    );
  }

  await page.locator(`[id="${found.optId}"]`).click({ force: true });
  await settle(page);

  // Re-locate by title: the round trip may have rebuilt the control.
  //
  // Equality is deliberately loose: `.includes`, not `===`. Measured on
  // "Traded Currency" (60A FX) - selecting "USD" reads back as
  // "USD United States Dollar" once the round trip has a real value to
  // describe, where beforehand the field showed the bare code. That is SAP
  // enriching the display, not refusing the choice, and a strict equality
  // check would misreport it as a revert - the exact failure mode this check
  // exists to catch (see TC-003 V07, "At Notice" silently reverting to
  // "Fixed Term"). A genuine revert still fails this: the read-back text is a
  // *different* option's label, not a superset of the one requested.
  const got = (await field(page, title, nth).inputValue()).trim();
  const wanted = optionText.trim().toLowerCase();
  if (!got.toLowerCase().includes(wanted)) {
    throw new Error(`dropdown "${title}": selected "${optionText}" but it holds "${got}"`);
  }
  return got;
}

/**
 * Open a field's F4 value help.
 *
 * The gesture is the plain F4 key on the focused input - but what it opens is
 * NOT an `M1:` popup window, which is why `readPopup` reports nothing and every
 * later click on the field times out (the field is covered). WebGUI renders the
 * hit list as an inline `#SearchHelp<n>` layer with `role="dialog"` and a grid
 * of results. Read it with `readSearchHelp`, close it with `closeValueHelp` -
 * leaving it open blocks the whole screen.
 */
export async function openValueHelp(page: Page, title: string, nth = 0) {
  const el = field(page, title, nth);
  await el.click();
  await settle(page, 6000);
  await page.keyboard.press('F4');
  await settle(page, 30_000);

  const open = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[id^="SearchHelp"][role="dialog"]')).some((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }),
  );
  if (!open) throw new Error(`value help for "${title}"[${nth}] did not open on F4`);
}

/**
 * Read the open F4 hit list: its rows, and the item count the dialog reports.
 *
 * This grid is rendered as two side-by-side tables that share row indices: a
 * "left" table (`#SHresultgrid<n>-mrss-cont-left-Row-<i>`) holding only the
 * row-selection checkbox, and the actual data table
 * (`#SHresultgrid<n>-mrss-cont-none-Row-<i>`, found via the left row's
 * `aria-owns`) holding one `<td>` per column, each with a
 * `span[id$="#txt"]` carrying the visible text (measured: row 0 of the
 * Product Type help is `01A  Stocks`). Reading `[role="row"]` directly, as a
 * normal ALV grid allows, returns only the left table and therefore nothing -
 * this is why that was tried first and came back empty.
 *
 * The count matters. The grid renders a window of rows, not all of them, so
 * "rows read" and "items the search help found" are different numbers and a
 * caller that assumes it has everything will silently work from a truncated
 * list. Both are returned; the caller decides whether the difference matters.
 */
export async function readSearchHelp(page: Page): Promise<{
  rows: string[][];
  total: number | null;
  header: string[];
}> {
  // Scroll the result grid to pull in lazily rendered rows, stopping when the
  // count stops growing rather than after a fixed number of pages.
  let previous = -1;
  for (let i = 0; i < 25; i++) {
    const count = await page.evaluate(() => {
      const grid = document.querySelector('[id*="-mrss-cont-none-"]')?.closest('table, tbody');
      if (!grid) return 0;
      const scroller = grid.closest('[class*="Scroll"], div[style*="overflow"]') ?? grid.parentElement;
      if (scroller) (scroller as HTMLElement).scrollTop = (scroller as HTMLElement).scrollHeight;
      return grid.querySelectorAll('[id*="-mrss-cont-none-Row-"]').length;
    });
    if (count === previous) break;
    previous = count;
    await page.waitForTimeout(300);
    await settle(page, 8000);
  }

  return page.evaluate(() => {
    const dialog = Array.from(document.querySelectorAll('[id^="SearchHelp"][role="dialog"]')).find(
      (d) => {
        const r = d.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      },
    );
    if (!dialog) return { rows: [], total: null, header: [] };

    // "Items (146)" in the dialog's own text.
    const total = Number(
      ((dialog as HTMLElement).innerText ?? '').match(/Items\s*\((\d+)\)/i)?.[1] ?? NaN,
    );

    const dataRows = Array.from(dialog.querySelectorAll('[id*="-mrss-cont-none-Row-"]'));
    const rows = dataRows
      .map((r) =>
        Array.from(r.querySelectorAll('td'))
          .map((td) => (td.querySelector('span[id$="#txt"]') as HTMLElement | null)?.innerText.trim() ?? '')
          .filter((t) => t !== ''),
      )
      .filter((cells) => cells.length > 0);

    // Column headers live in the grid's own header row, not the left table.
    const headerRow = dialog.querySelector('[id*="-mrss-hdr-none-"]');
    const header = headerRow
      ? Array.from(headerRow.querySelectorAll('th, [role="columnheader"]'))
          .map((h) => (h as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
      : [];

    return { rows, total: Number.isNaN(total) ? null : total, header };
  });
}

/**
 * Close an inline live-search suggestion list ("Search Results"), if one is
 * open or about to open.
 *
 * Distinct from `closeValueHelp`: this is not the modal F4 dialog but a CBS
 * field's own type-ahead panel (e.g. FTR_CREATE's Company Code), which SAP
 * renders asynchronously after a server round trip — a plain Escape pressed
 * immediately after typing fires before the panel exists and does nothing.
 * Left open, it overlaps whatever field sits below it and intercepts every
 * click there until the caller's own timeout gives up. `settle` first lets
 * that round trip land, then Escape is retried until the panel is gone.
 */
export async function dismissLiveSearch(page: Page, timeoutMs = 5_000) {
  await settle(page, timeoutMs);
  const isOpen = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[id*="_TALB-hlitem-0"]')).some((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }),
    );
  const start = Date.now();
  while ((await isOpen()) && Date.now() - start < timeoutMs) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
}

/** Close an open F4 hit list without choosing anything. */
export async function closeValueHelp(page: Page) {
  await page.keyboard.press('Escape');
  await settle(page, 15_000);
  const stillOpen = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[id^="SearchHelp"][role="dialog"]')).some((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }),
  );
  if (stillOpen) {
    // Fall back to the dialog's own Cancel.
    const id = await page.evaluate(() => {
      const dialog = Array.from(document.querySelectorAll('[id^="SearchHelp"][role="dialog"]')).find(
        (d) => d.getBoundingClientRect().width > 0,
      );
      const btn = Array.from(dialog?.querySelectorAll('[role="button"]') ?? []).find((b) =>
        /cancel|close/i.test(`${(b as HTMLElement).title} ${b.textContent}`),
      );
      return btn?.id ?? null;
    });
    if (id) await clickButton(page, id);
  }
}

/**
 * Read a Dynpro checkbox / radio button.
 *
 * ITS renders these as `[role="checkbox"]` divs carrying `aria-checked`, not as
 * `<input type=checkbox>`, so they do not appear in `dumpScreen` at all and
 * `.isChecked()` does not work on them. Discover them with a
 * `[role="checkbox"], [role="radio"]` query.
 */
export async function readCheckbox(page: Page, id: string): Promise<boolean | null> {
  return page.evaluate((elId) => {
    const el = document.getElementById(elId);
    if (!el) return null;
    return el.getAttribute('aria-checked') === 'true';
  }, id);
}

/**
 * Drive a checkbox to a wanted state, then prove it landed there.
 *
 * The verify is the point. TBB1's "Test Run" defaults to ON, so a post that
 * never actually clears it simulates, reports success, and writes nothing -
 * the same phantom-pass shape as TC-001 defect D1. Never assume the click took.
 */
export async function setCheckbox(page: Page, id: string, want: boolean, log?: (s: string) => void) {
  const before = await readCheckbox(page, id);
  if (before === null) throw new Error(`checkbox ${id} not found on this screen`);

  if (before !== want) {
    await clickButton(page, id);
    const after = await readCheckbox(page, id);
    if (after !== want) {
      throw new Error(`checkbox ${id}: wanted ${want}, still ${after} after clicking`);
    }
    log?.(`  checkbox ${id}: ${before} -> ${after}`);
  } else {
    log?.(`  checkbox ${id}: already ${want}`);
  }
}

/**
 * Find the screen's Save button and return its id.
 *
 * The id is not stable across transactions (`M0:50::btn[11]` on the deal screen
 * is not where Save lives everywhere), so resolve it by its Ctrl+S tooltip
 * instead of hardcoding. "Save as Variant" also answers to Ctrl+S on selection
 * screens like TBB1 and is explicitly excluded - saving a variant is not saving
 * a transaction, and confusing the two would look like a successful write.
 */
export async function findSaveButton(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[role="button"]'));
    const hit = els.find((el) => {
      const title = (el as HTMLElement).title ?? '';
      const text = (el.textContent ?? '').trim();
      if (/variant/i.test(title) || /variant/i.test(text)) return false;
      // Exact tooltip match, not a substring test: "(Ctrl+Shift+F1)" ("User
      // Status" on the 22B securities screen) contains "Ctrl+S" as a literal
      // substring and was matching before this was tightened, resolving Save
      // to the wrong button entirely - the click succeeded (it is a real,
      // visible button) and produced a save-shaped but wrong refusal ("SEC 0
      // has no user status").
      if (!(/^\s*\(ctrl\+s\)\s*$/i.test(title) || /^Save\b/.test(text))) return false;
      // A Ctrl+S-tooltipped element that is not actually laid out on screen is
      // not the real button - measured on the 51A money-market deal screen,
      // where an off-screen match (M0:54::btn[37], no bounding box) sorted
      // before the real Save button (M0:50::btn[11]) in document order.
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return hit ? hit.id : null;
  });
}

/** Press a key and wait for the resulting ITS round trip. */
export async function pressKey(page: Page, key: string, maxMs = 25_000) {
  await page.keyboard.press(key);
  await settle(page, maxMs);
}

/**
 * Click a WebGUI toolbar/screen button by its generated id, then settle.
 *
 * ITS renders buttons as <div role="button"> that react to mouse events, and
 * they are sometimes reported as not stable/actionable by Playwright even when
 * they are on screen. Escalate rather than fail: normal click, then force, then
 * a real mouse sequence at the element's centre.
 */
export async function clickButton(page: Page, id: string, maxMs = 25_000) {
  const loc = page.locator(`[id="${id}"]`).first();
  await loc.waitFor({ state: 'attached', timeout: 15_000 });

  try {
    await loc.click({ timeout: 8000 });
  } catch {
    try {
      await loc.click({ force: true, timeout: 8000 });
    } catch {
      const box = await loc.boundingBox();
      if (!box) throw new Error(`button ${id} has no layout box - cannot click`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
    }
  }
  await settle(page, maxMs);
}

/**
 * Read a modal popup, if one is open.
 *
 * WebGUI renders the main window's controls with id prefix `M0:` and each
 * further window as `M1:`, `M2:` ... so the presence of an `M1:` control is the
 * reliable "a popup is open" signal - there is no wnd[1] like the GUI lane.
 */
export async function readPopup(page: Page) {
  return page.evaluate(() => {
    const parts = Array.from(document.querySelectorAll('[id^="M1:"]'));
    if (parts.length === 0) return null;

    const buttons = parts
      .filter((el) => el.getAttribute('role') === 'button')
      .map((b) => ({
        id: b.id,
        title: (b as HTMLElement).title ?? '',
        text: (b.textContent ?? '').trim().slice(0, 40),
      }));

    // Walk up from a popup control to the outermost node that still only
    // contains popup content, and take its text.
    let node: HTMLElement | null = parts[0] as HTMLElement;
    let best = '';
    for (let i = 0; i < 8 && node; i++) {
      const t = (node.innerText ?? '').trim();
      if (t.length > best.length && t.length < 1200) best = t;
      node = node.parentElement;
    }
    return { text: best, buttons };
  });
}

/**
 * Confirm popups that are known-safe for this flow. Anything unrecognised is
 * left on screen and reported - auto-confirming an unknown dialog during a
 * write is how a test agrees to something nobody intended.
 */
export async function handleKnownPopups(
  page: Page,
  safePattern: RegExp,
  log: (s: string) => void,
  maxRounds = 6,
): Promise<{ handled: number; blocked: string | null }> {
  let handled = 0;
  for (let i = 0; i < maxRounds; i++) {
    const popup = await readPopup(page);
    if (!popup) return { handled, blocked: null };

    log(`  POPUP: ${popup.text.replace(/\s+/g, ' ').slice(0, 300)}`);
    log(`  POPUP buttons: ${JSON.stringify(popup.buttons)}`);

    if (!safePattern.test(popup.text)) {
      return { handled, blocked: popup.text.replace(/\s+/g, ' ').slice(0, 400) };
    }

    // The default action carries "(Enter)" in its tooltip.
    const confirm =
      popup.buttons.find((b) => /\(Enter\)/i.test(b.title)) ??
      popup.buttons.find((b) => /^(Yes|Copy|Continue|OK|Close)$/i.test(b.text));
    if (!confirm) return { handled, blocked: `no confirm button: ${JSON.stringify(popup.buttons)}` };

    log(`  confirming with "${confirm.text}" (${confirm.id})`);
    await clickButton(page, confirm.id);
    handled++;
  }
  return { handled, blocked: 'popup still open after max rounds' };
}

/**
 * Read the Treasury "Check run: Display messages" dialog, if it is the one open.
 *
 * Saving a financial transaction runs a check and, when it has anything to say,
 * shows an ALV of messages with severity counters in its toolbar
 * ("0 Terminations", "0 Errors", "2 Warnings", "1 Information"). Continue
 * commits; Cancel abandons the save.
 *
 * The counters are the point. Matching this dialog on its text alone would
 * click Continue just as happily on a run reporting errors, which is precisely
 * the "agreed to something nobody intended" failure the popup rules exist to
 * prevent. Returns null when the open popup is not a check run.
 */
export async function readCheckRun(page: Page) {
  return page.evaluate(() => {
    const parts = Array.from(document.querySelectorAll('[id^="M1:"]'));
    if (parts.length === 0) return null;

    const buttons = Array.from(
      document.querySelectorAll('[id^="M1:"][role="button"]'),
    ) as HTMLElement[];

    const count = (label: string) => {
      const b = buttons.find((x) => new RegExp(`\\d+\\s+${label}`, 'i').test(x.title ?? ''));
      if (!b) return null;
      return Number(b.title.match(/(\d+)/)?.[1] ?? NaN);
    };

    const terminations = count('Terminations');
    const errors = count('Errors');
    // No severity counters => not a check-run dialog.
    if (terminations === null || errors === null) return null;

    const confirm = buttons.find((b) => /Continue \(Enter\)/i.test(b.title ?? ''));

    let node: HTMLElement | null = parts[0] as HTMLElement;
    let text = '';
    for (let i = 0; i < 8 && node; i++) {
      const t = (node.innerText ?? '').trim();
      if (t.length > text.length && t.length < 2000) text = t;
      node = node.parentElement;
    }

    return {
      terminations,
      errors,
      warnings: count('Warnings') ?? 0,
      information: count('Information') ?? 0,
      confirmId: confirm?.id ?? null,
      text: text.replace(/\s+/g, ' ').slice(0, 800),
    };
  });
}

/**
 * Handle the dialogs a Treasury save can raise, and only those.
 *
 * Two kinds are expected here:
 *  - the check-run message list, confirmed only when it reports no errors and
 *    no terminations - its warnings are recorded either way;
 *  - dialogs matching `safePattern` (the working-day check).
 * Anything else is left on screen and returned as `blocked`.
 */
export async function handleSaveDialogs(
  page: Page,
  safePattern: RegExp,
  log: (s: string) => void,
  maxRounds = 6,
): Promise<{ handled: number; blocked: string | null; checkRun: string[] }> {
  let handled = 0;
  const checkRun: string[] = [];

  for (let i = 0; i < maxRounds; i++) {
    const check = await readCheckRun(page);
    if (check) {
      const summary =
        `check run: ${check.terminations} terminations, ${check.errors} errors, ` +
        `${check.warnings} warnings, ${check.information} information`;
      log(`  ${summary}`);
      log(`  check run messages: ${check.text}`);
      checkRun.push(`${summary}\n${check.text}`);

      if (check.terminations > 0 || check.errors > 0) {
        return { handled, blocked: `check run reported errors - ${summary}: ${check.text}`, checkRun };
      }
      if (!check.confirmId) {
        return { handled, blocked: `check run has no Continue button: ${check.text}`, checkRun };
      }
      log('  confirming check run (0 errors, 0 terminations)');
      await clickButton(page, check.confirmId);
      handled++;
      continue;
    }

    const popup = await readPopup(page);
    if (!popup) return { handled, blocked: null, checkRun };

    log(`  POPUP: ${popup.text.replace(/\s+/g, ' ').slice(0, 300)}`);
    if (!safePattern.test(popup.text)) {
      return { handled, blocked: popup.text.replace(/\s+/g, ' ').slice(0, 400), checkRun };
    }

    const confirm =
      popup.buttons.find((b) => /\(Enter\)/i.test(b.title)) ??
      popup.buttons.find((b) => /^(Yes|Copy|Continue|OK|Close)$/i.test(b.text));
    if (!confirm) {
      return { handled, blocked: `no confirm button: ${JSON.stringify(popup.buttons)}`, checkRun };
    }
    log(`  confirming with "${confirm.text}" (${confirm.id})`);
    await clickButton(page, confirm.id);
    handled++;
  }
  return { handled, blocked: 'popup still open after max rounds', checkRun };
}

/** The Dynpro status bar message, if any. */
export async function statusMessage(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const el = document.querySelector('#sapMsg, .lsMessageBar, [id*="Msg"], [role="status"]');
      return (el as HTMLElement | null)?.innerText?.trim() ?? '';
    })
    .catch(() => '');
}

/** Program/screen/transaction the WebGUI info area reports. */
export async function screenInfo(page: Page) {
  return page.evaluate(() => {
    const t = document.body.innerText;
    // The info area renders as tab-delimited rows ("Screen\t FTR_ENTRY/2000").
    // The tab is what distinguishes them from the menu bar, which also contains
    // the words "System" and "Transaction" - matching without it reads the menu.
    const grab = (label: string) =>
      t.match(new RegExp('\\t\\s*' + label + '\\t\\s*([^\\t\\n]+)'))?.[1]?.trim() ?? '';
    return {
      system: grab('System'),
      client: grab('Client'),
      user: grab('User'),
      screen: grab('Screen'),
      transaction: grab('Transaction'),
    };
  });
}

/**
 * Write a control + text dump and a screenshot. Read-only.
 *
 * Lean by default. A raw WebGUI dump is ~12 KB per screen, almost all of it
 * noise: the same accessibility boilerplate on every screen, the menu bar, and
 * decorative controls. Reading five of those costs ~15k tokens and tells you
 * nothing you could not get from the input fields alone. Pass `{ full: true }`
 * when a screen genuinely is not behaving and you need everything.
 */
export async function dumpScreen(
  page: Page,
  name: string,
  opts: { full?: boolean } = {},
) {
  const full = opts.full ?? false;

  const dump = await page.evaluate((isFull) => {
    // The a11y help block is identical on every WebGUI screen. It is a
    // contiguous run, and popup text can follow it, so cut the run out rather
    // than truncating the tail.
    const stripBoilerplate = (t: string) => {
      const start = t.indexOf('EmphasizedPrevious Action');
      const endMarker = 'Use Shift+Arrow keys to resize.';
      const end = t.indexOf(endMarker);
      if (start === -1 || end === -1 || end < start) return t;
      return t.slice(0, start) + '[a11y boilerplate removed]' + t.slice(end + endMarker.length);
    };

    const controls: Record<string, unknown>[] = [];
    document
      .querySelectorAll('input, select, textarea, button, a[role="button"], [role="button"], [role="tab"]')
      .forEach((el) => {
        const e = el as HTMLInputElement;
        const box = e.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) return;

        const id = e.id || '';
        const role = e.getAttribute('role') || '';
        const isInput = e.tagName === 'INPUT' || e.tagName === 'SELECT' || e.tagName === 'TEXTAREA';

        const text = (e.textContent ?? '').trim();

        if (!isFull) {
          // Menu bar and window chrome carry no test information.
          if (/^Mnu\d+_But$/.test(id) || id === 'infoarea_text' || id === 'cuaheader-logo') return;
          if (id === 'sysInfoAreaToggle') return;
          // Icon-only toolbar buttons have a tooltip but no text. Named actions
          // (Save, Check, Cancel, Copy) have text - those are the clickable
          // things a test actually uses.
          if (!isInput && role !== 'tab' && text === '') return;
        }

        controls.push({
          tag: e.tagName,
          id,
          role,
          isInput,
          title: e.title || '',
          value: e.getAttribute('type') === 'password' ? '<redacted>' : (e.value ?? '').slice(0, 40),
          text: text.slice(0, 50),
        });
      });

    const raw = document.body.innerText ?? '';
    const text = isFull ? raw.slice(0, 7000) : stripBoilerplate(raw).slice(0, 1200);
    return { title: document.title, text, controls };
  }, full);

  // Lean output is compact lines, not JSON. Fields are addressed by `title`
  // (see `field()`), so an input's id/role/tag are dead weight; buttons and
  // tabs keep their id because clickButton needs it.
  const c = dump.controls as Array<{
    tag: string; id: string; role: string; isInput: boolean;
    title: string; value: string; text: string;
  }>;

  const body = full
    ? c.map((x) => JSON.stringify(x))
    : [
        ...c.filter((x) => x.isInput).map((x) => `  "${x.title}" = "${x.value}"`),
        ...c.filter((x) => x.role === 'tab').map((x) => `  [tab] ${x.text}  ->  ${x.id}`),
        ...c
          .filter((x) => !x.isInput && x.role !== 'tab')
          .map((x) => `  [btn] ${x.text}  ->  ${x.id}${x.title ? `  (${x.title.trim()})` : ''}`),
      ];

  const out = [
    `screen dump: ${name}${full ? ' (full)' : ' (lean)'}`,
    `title: ${dump.title}`,
    `\n--- visible text ---\n${dump.text}`,
    `\n--- controls (${dump.controls.length}) ---`,
    ...body,
  ].join('\n');

  mkdirSync(artifactDir(), { recursive: true });
  mkdirSync(evidenceDir(), { recursive: true });
  writeFileSync(resolve(artifactDir(), `screen-${name}.txt`), out, 'utf8');
  await page.screenshot({
    path: resolve(evidenceDir(), `screen-${name}.png`),
    fullPage: true,
  });
  return dump;
}

/**
 * Full screen text with the a11y boilerplate removed. Use this when a value has
 * to be parsed off the screen (a document number, a message) - it is never
 * truncated, unlike the lean dump, which exists to be read by a human.
 */
export async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const t = document.body.innerText ?? '';
    const start = t.indexOf('EmphasizedPrevious Action');
    const endMarker = 'Use Shift+Arrow keys to resize.';
    const end = t.indexOf(endMarker);
    if (start === -1 || end === -1 || end < start) return t;
    return t.slice(0, start) + t.slice(end + endMarker.length);
  });
}

/**
 * Discovery mode. Off by default so a proven case runs as pure regression and
 * produces nothing to read; on for exploring a screen or diagnosing a failure.
 *   $env:DISCOVER="1"
 */
export const DISCOVER = process.env.DISCOVER === '1';

/**
 * Dump only while exploring. A green regression run should emit nothing a human
 * or a model has to read - that is the whole token saving. Failures still get a
 * dump via `dumpOnFailure`, because that is when the detail is worth paying for.
 */
export async function dumpIfDiscovering(
  page: Page,
  name: string,
  opts: { full?: boolean } = {},
) {
  if (!DISCOVER) return null;
  return dumpScreen(page, name, opts);
}

/** Always capture a full dump - call from a catch block or test.afterEach. */
export async function dumpOnFailure(page: Page, name: string) {
  return dumpScreen(page, `FAIL-${name}`, { full: true }).catch(() => null);
}

/**
 * Screenshot only - no dump, no matter what DISCOVER says.
 *
 * For the moments that ARE the evidence: the status bar confirming a save, the
 * application log after a post. Those messages were already captured as text,
 * but text in a log file is not what a human reviewing a write wants to see,
 * and on a green run (DISCOVER off) nothing visual was kept at all - so the
 * proof of a database write existed only as a line someone had to take on
 * trust. A screenshot costs no context to produce and nothing to read unless
 * asked for, which is the opposite trade-off from a screen dump.
 */
export async function captureEvidence(page: Page, name: string, shows?: string) {
  mkdirSync(evidenceDir(), { recursive: true });
  const path = resolve(evidenceDir(), `${name}.png`);
  await page.screenshot({ path, fullPage: true }).catch(() => {});
  // Recorded here rather than in each spec: every screenshot this suite takes
  // goes through this function, so the run file's Evidence table lists what was
  // actually captured instead of what someone remembered to mention.
  journal.evidence(`evidence/${sapSystem.id}/${name}.png`, shows ?? name);
  return path;
}

/**
 * Where this system's artifacts live: `results/web/<SYSTEM_ID>`.
 *
 * Everything a run produces is scoped by the system it was produced on,
 * because the identifiers in it are only meaningful there. Two landscapes
 * issue transaction numbers from their own ranges, so the same number is a
 * different, real document on each - and an unscoped artifact silently
 * carries one system's number into a run against another. The dangerous case
 * is a resume: `tc-009-deal-number.txt` holding a NIIF deal number, read back
 * during a run against a second system, would settle and post whatever real
 * transaction happens to hold that number there. Scoping here rather than in
 * each spec means every case - including ones not written yet - gets this for
 * free, the same way screen models and treasury components are shared.
 */
function artifactDir() {
  return resolve(repoRoot, 'results', 'web', sapSystem.id);
}

/** Where this system's screenshots live: `evidence/<SYSTEM_ID>`. Same reasoning. */
function evidenceDir() {
  return resolve(repoRoot, 'evidence', sapSystem.id);
}

export function writeArtifact(name: string, content: string) {
  mkdirSync(artifactDir(), { recursive: true });
  writeFileSync(resolve(artifactDir(), name), content, 'utf8');
}

/**
 * Read an artifact written by an earlier stage, e.g. the deal number captured
 * by the create step and needed by settle and post. Returns '' if absent - the
 * caller decides whether that is fatal, because guessing a deal number would
 * settle or post somebody else's transaction.
 *
 * Reads only from the *current* system's directory: an artifact from another
 * landscape is not a usable fallback here, it is a wrong-system write waiting
 * to happen, so its absence must look like absence.
 */
export function readArtifact(name: string): string {
  try {
    return readFileSync(resolve(artifactDir(), name), 'utf8').trim();
  } catch {
    return '';
  }
}

/**
 * Refuse to start a batch that another live process is already running.
 *
 * A batch spec (TC-008, TC-012, ...) only writes its per-row resume artifacts
 * in `afterAll`, once, at the very end - so two processes running the same
 * batch concurrently have no way to see each other's progress and will each
 * independently create, settle, post (and, for TC-012, accrue/value) their
 * own deal for the same row. This happened for real on 2026-08-18: a shell
 * command that the calling tool reported as killed after a 10-minute timeout
 * had not actually stopped, and a second "resume" run against the same
 * dataset produced 4 extra, fully-written duplicate deals on DS4/100 before
 * anyone noticed.
 *
 * `name` is the dataset id (unique per batch) - the lock lives at
 * `results/web/<SYSTEM_ID>/<name>.lock` and holds `<pid>|<ISO timestamp>`. A
 * lock whose pid is no longer alive (`process.kill(pid, 0)` throwing) is
 * stale and is silently taken over; a lock whose pid is still alive throws,
 * refusing to start the second run rather than letting it duplicate writes.
 *
 * The lock is per system, not global, because it guards against duplicating
 * writes *on one client*. Two runs of the same batch against two different
 * landscapes write to different databases and are legitimately concurrent -
 * a global lock would block that for no safety gain.
 */
export function acquireBatchLock(name: string) {
  const lockName = `${name}.lock`;
  const existing = readArtifact(lockName);
  if (existing) {
    const [pidStr, startedAt] = existing.split('|');
    const pid = Number(pidStr);
    let alive = false;
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) {
      throw new Error(
        `Batch '${name}' is already running against ${sapSystem.id} as pid ${pid} ` +
          `(started ${startedAt}). Refusing to start a second instance - a concurrent ` +
          `run would duplicate live writes to SAP for whichever rows are still in ` +
          `progress. If that process is confirmed dead (check with 'ps aux' / Task ` +
          `Manager, not just a tool timeout), delete ` +
          `results/web/${sapSystem.id}/${lockName} and retry.`,
      );
    }
    // Stale lock from a process that no longer exists - safe to take over.
  }
  writeArtifact(lockName, `${process.pid}|${new Date().toISOString()}`);
}

/** Release a lock taken by {@link acquireBatchLock}. Safe to call even if none was held. */
export function releaseBatchLock(name: string) {
  try {
    unlinkSync(resolve(artifactDir(), `${name}.lock`));
  } catch {
    // already gone - nothing to release
  }
}
