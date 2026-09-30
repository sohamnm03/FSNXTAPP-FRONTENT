"""Read-only: dump the ALV grid of an open SAP GUI session to JSON.
Usage: python dump_grid.py <con_idx> <ses_idx> <grid_id_relative_to_session> <out.json>
Only reads GuiGridView properties (ColumnOrder, RowCount, GetCellValue); presses nothing.
"""
import json, sys
import win32com.client

con_i, ses_i, grid_id, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
app = win32com.client.GetObject("SAPGUI").GetScriptingEngine
ses = app.FindById("/app/con[%s]/ses[%s]" % (con_i, ses_i))
info = ses.Info
meta = {"system": info.SystemName, "client": info.Client, "user": info.User,
        "transaction": info.Transaction, "program": info.Program}
assert meta["system"] == "DS4" and meta["client"] == "100", meta
grid = ses.FindById(grid_id)
cols = [grid.ColumnOrder(i) for i in range(grid.ColumnOrder.Count)]
titles = {}
for c in cols:
    try:
        titles[c] = grid.GetColumnTitles(c)(0)
    except Exception:
        titles[c] = c
n = grid.RowCount
rows = []
for r in range(n):
    if r % 30 == 0:
        grid.FirstVisibleRow = r  # scroll only, so lazy rows load
    rows.append({c: grid.GetCellValue(r, c) for c in cols})
json.dump({"meta": meta, "grid_id": grid_id, "columns": cols, "titles": titles,
           "row_count": n, "rows": rows}, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(json.dumps(meta), n, "rows", len(cols), "cols ->", out)
