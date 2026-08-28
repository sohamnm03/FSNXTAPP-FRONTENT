"""
Datasets — the input rows a data-driven GUI-lane case iterates.

`screens.py` keeps element ids out of cases; this keeps *values* out of them, for
the same reason and with the same rule: a case says which row it wants, never
what is in it. The web lane already works this way (`test-data/*.dataset.json`
read by a spec through its `DATASET_ROWS` env var), and both lanes read the same
files so a row means the same thing whichever lane exercises it.

Rows are addressed by id. An unknown id raises and lists what exists rather than
falling back to a default: a typo that quietly ran the baseline row would write a
real document nobody asked for.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "test-data"

#: SAP's own display format, and what every dataset in this repo uses.
_DATE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")


class Dataset:
    """One dataset file. `defaults` apply to every row; a row may override any."""

    def __init__(self, name: str, data: dict):
        self.name = name
        self.data = data
        self.defaults = data.get("defaults") or {}
        self._rows = {str(r["id"]): r for r in (data.get("rows") or []) if "id" in r}
        if not self._rows:
            raise ValueError(f"{name}: dataset has no rows with an id")
        self._validate()

    def _validate(self) -> None:
        """
        Dates are checked on load, not at the field.

        A malformed date reaches SAP as a rejected keystroke halfway through a
        deal, which is a confusing way to learn about a typo in a JSON file.
        """
        for row_id, row in self._rows.items():
            for key, value in row.items():
                if key.lower().endswith("date") and not _DATE.match(str(value)):
                    raise ValueError(
                        f"{self.name} row {row_id!r}: {key}={value!r} is not dd.mm.yyyy"
                    )

    @property
    def row_ids(self) -> list[str]:
        return list(self._rows)

    def row(self, row_id: str) -> dict:
        """One row, with `defaults` merged underneath it."""
        if row_id not in self._rows:
            raise KeyError(
                f"{self.name}: no row {row_id!r}. Known: {', '.join(self.row_ids)}. "
                f"Add it to test-data/{self.name}.dataset.json — never inline a value "
                f"in a case module."
            )
        return {**self.defaults, **self._rows[row_id]}

    def select(self, spec: str | None) -> list[dict]:
        """
        Resolve a `--rows` argument to rows, in the order asked for.

        Accepts a comma-separated list of ids, or `all`. `None` is refused rather
        than defaulted: which rows run decides what gets written, so it is the
        caller's decision to state.
        """
        if spec is None:
            raise ValueError(
                f"{self.name}: no rows selected. Pass --rows with one or more of "
                f"{', '.join(self.row_ids)}, or 'all'."
            )
        if spec.strip().lower() == "all":
            return [self.row(r) for r in self.row_ids]
        wanted = [part.strip() for part in spec.split(",") if part.strip()]
        if not wanted:
            raise ValueError(f"{self.name}: --rows {spec!r} selected nothing")
        return [self.row(r) for r in wanted]


@lru_cache(maxsize=None)
def dataset(name: str) -> Dataset:
    """Load a dataset by filename stem, e.g. `term-loan-variable-period`."""
    path = DATA_DIR / f"{name}.dataset.json"
    if not path.exists():
        available = ", ".join(sorted(p.name.replace(".dataset.json", "")
                                    for p in DATA_DIR.glob("*.dataset.json")))
        raise FileNotFoundError(
            f"No dataset {name!r} under test-data/. Available: {available}"
        )
    return Dataset(name, json.loads(path.read_text(encoding="utf-8")))
