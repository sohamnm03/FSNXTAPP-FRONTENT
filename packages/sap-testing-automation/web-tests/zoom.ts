/**
 * Browser zoom for the run, as a factor (0.9 = 90%). `SAP_ZOOM=1` turns it off.
 *
 * Why zoom at all: SAP screens are wider than the window. At 100% the right of
 * a WebGUI screen or a wide ALV sits outside the viewport, so a human watching
 * the run cannot see what the test is doing.
 *
 * How, and why not the obvious way. Zoom has to be invisible to Playwright's
 * input coordinates, so it is done at browser level - `--force-device-scale-factor`
 * with the window maximized and viewport emulation switched OFF (`viewport:
 * null`, see BROWSER_ZOOM_ARGS and the fixture). Chromium then reports a viewport
 * of (screen size)/zoom CSS px filling the whole screen, and everything above
 * the compositor - hit testing, element boxes, CDP input - stays in ordinary
 * CSS px.
 *
 * The rejected approach, recorded because it looks correct and is not: setting
 * `document.documentElement.style.zoom`. It reflows the top document exactly as
 * wanted, and clicks in the top document land - but Playwright's click point for
 * an element inside a CHILD IFRAME is then computed through the zoomed parent and
 * lands short. Measured on the ZFS_ODEMO_M006 facility app (which renders in an
 * ITS iframe): every click on `#i-cocode` was intercepted by the field's <label>
 * and TC-001 failed at its first form field, while the same click succeeded with
 * zoom off. Do not reintroduce document zoom.
 */
export const SAP_ZOOM = Number(process.env.SAP_ZOOM ?? 0.9);

if (!Number.isFinite(SAP_ZOOM) || SAP_ZOOM <= 0.2 || SAP_ZOOM > 1) {
  throw new Error(`SAP_ZOOM must be a factor in (0.2, 1]; got '${process.env.SAP_ZOOM}'`);
}

/**
 * Launch args. The window is always started maximized - fixed `--window-size`
 * fights maximization (Chromium honours whichever was applied last, which made
 * the window come up smaller than the screen and read as "minimised" to a
 * human watching) - so the browser now always fills the screen, zoomed or not.
 * `--force-device-scale-factor` is only added when actually zooming; at
 * `SAP_ZOOM=1` a maximized window with no scaling is exactly 100%.
 */
export const BROWSER_ZOOM_ARGS = [
  '--start-maximized',
  ...(SAP_ZOOM === 1 ? [] : [`--force-device-scale-factor=${SAP_ZOOM}`]),
];

/**
 * Context/project viewport option. Always `null` - the page takes the real
 * (maximized) window size instead of an emulated viewport, which is what lets
 * `--start-maximized` and `--force-device-scale-factor` take effect. See the
 * comment on `BROWSER_ZOOM_ARGS`.
 */
export const ZOOM_VIEWPORT_OPTION = null;
