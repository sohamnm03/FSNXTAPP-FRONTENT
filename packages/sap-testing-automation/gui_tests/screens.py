"""
Screen models — every element id the GUI lane relies on, in one place per screen.

The web lane addresses fields by title through `web-tests/screens/*.json`; a
spec never contains a literal handle. The GUI lane needs the same discipline for
a sharper reason: its handles are SAP GUI Scripting paths
(`wnd[0]/usr/tabs.../ctxtVTG_TERM-XBLFZ`) that are unreadable inline, vary with
customising, and are not portable between systems — CLAUDE.md rule 4 exists
because a hand-written id that doesn't exist fails as "not found", which reads
like a product bug and isn't one.

So a case says `deal.field("termStart")`, and the id lives in
`gui-tests/screens/ftr-deal-irate.json` next to a note about what it is. When a
transport moves a field, one JSON file changes and every case follows.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

SCREEN_DIR = Path(__file__).resolve().parent / "screens"


class Screen:
    """One screen's model. Raises on an unknown name rather than guessing."""

    def __init__(self, name: str, data: dict):
        self.name = name
        self.data = data

    def _lookup(self, section: str, key: str) -> dict:
        entries = self.data.get(section) or {}
        if key not in entries:
            known = ", ".join(sorted(entries)) or "(none)"
            raise KeyError(
                f"{self.name}: no {section[:-1] if section.endswith('s') else section} "
                f"named {key!r}. Known: {known}. "
                f"Discover it with sap_get_screen_elements and add it to "
                f"gui-tests/screens/{self.name}.json — never inline an id in a case."
            )
        return entries[key]

    def field(self, key: str) -> str:
        return self._lookup("controls", key)["id"]

    def label(self, key: str) -> str:
        entry = self._lookup("controls", key)
        return entry.get("label", key)

    def button(self, key: str) -> str:
        return self._lookup("buttons", key)["id"]

    def tab(self, key: str) -> str:
        return self._lookup("tabs", key)["id"]

    def header(self, key: str) -> str:
        return self._lookup("header", key)["id"]

    def result(self, key: str) -> dict:
        return self._lookup("results", key)

    def nested(self, section: str, key: str) -> dict:
        return self._lookup(section, key)


@lru_cache(maxsize=None)
def screen(name: str) -> Screen:
    """Load a screen model by filename stem, e.g. `ftr-deal-irate`."""
    path = SCREEN_DIR / f"{name}.json"
    if not path.exists():
        available = ", ".join(sorted(p.stem for p in SCREEN_DIR.glob("*.json")))
        raise FileNotFoundError(
            f"No screen model {name!r} under gui-tests/screens/. Available: {available}"
        )
    return Screen(name, json.loads(path.read_text(encoding="utf-8")))
