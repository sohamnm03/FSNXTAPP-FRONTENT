"""Markdown -> Word for the dyngw v2 FTR lifecycle test case.

Deliberately narrow: it handles exactly the constructs this document uses -
ATX headings, GFM tables, fenced code blocks, blockquotes, bullet lists,
horizontal rules, and inline **bold** / `code`. Anything fancier is out of
scope and would be guesswork.
"""
import os
import re
import sys
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.shared import Pt, Inches, RGBColor

SRC = sys.argv[1]
DST = sys.argv[2]

CODE_BG = "F2F2F2"
MONO = "Consolas"


def shade(cell, hexcolor):
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), hexcolor)
    tcPr.append(shd)


def add_inline(par, text):
    """**bold**, `code`, and plain text. Applied in one pass so a run is never
    both mangled and re-parsed."""
    for tok in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if not tok:
            continue
        if tok.startswith("**") and tok.endswith("**"):
            r = par.add_run(tok[2:-2])
            r.bold = True
        elif tok.startswith("`") and tok.endswith("`"):
            r = par.add_run(tok[1:-1])
            r.font.name = MONO
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(0xC0, 0x30, 0x30)
        else:
            par.add_run(tok)


def add_code_block(doc, lines):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = t.rows[0].cells[0]
    shade(cell, CODE_BG)
    cell.text = ""
    for i, ln in enumerate(lines):
        p = cell.paragraphs[0] if i == 0 else cell.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)
        r = p.add_run(ln)
        r.font.name = MONO
        r.font.size = Pt(8)
    doc.add_paragraph()


def add_table(doc, rows):
    header, body = rows[0], rows[1:]
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Light Grid Accent 1"
    hdr = t.rows[0].cells
    for i, h in enumerate(header):
        hdr[i].text = ""
        add_inline(hdr[i].paragraphs[0], h)
        for run in hdr[i].paragraphs[0].runs:
            run.bold = True
    for row in body:
        cells = t.add_row().cells
        for i, val in enumerate(row[: len(header)]):
            cells[i].text = ""
            add_inline(cells[i].paragraphs[0], val)
            for run in cells[i].paragraphs[0].runs:
                run.font.size = Pt(9)
    doc.add_paragraph()


def split_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def is_sep(line):
    return bool(re.match(r"^\s*\|?[\s:\-|]+\|[\s:\-|]*$", line)) and "-" in line


doc = Document()
st = doc.styles["Normal"]
st.font.name = "Calibri"
st.font.size = Pt(10.5)

src_lines = open(SRC, encoding="utf-8").read().split("\n")

i = 0
pending_table = []
while i < len(src_lines):
    line = src_lines[i]

    # fenced code
    if line.strip().startswith("```"):
        i += 1
        buf = []
        while i < len(src_lines) and not src_lines[i].strip().startswith("```"):
            buf.append(src_lines[i])
            i += 1
        i += 1
        add_code_block(doc, buf)
        continue

    # tables
    if line.strip().startswith("|"):
        block = []
        while i < len(src_lines) and src_lines[i].strip().startswith("|"):
            if not is_sep(src_lines[i]):
                block.append(split_row(src_lines[i]))
            i += 1
        if block:
            add_table(doc, block)
        continue

    stripped = line.strip()

    # image:  ![alt](relative/path.png)
    m_img = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$", stripped)
    if m_img:
        rel = m_img.group(2)
        img = rel if os.path.isabs(rel) else os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(SRC)), rel))
        if os.path.exists(img):
            try:
                doc.add_picture(img, width=Inches(6.3))
                doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                cap = doc.add_paragraph()
                cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                cr = cap.add_run(m_img.group(1))
                cr.italic = True
                cr.font.size = Pt(8.5)
                cr.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
            except Exception as exc:
                doc.add_paragraph("[image could not be embedded: %s - %s]" % (rel, exc))
        else:
            # Never silently drop a figure: a missing image must be visible in the output.
            doc.add_paragraph("[MISSING IMAGE: %s]" % rel)
        i += 1
        continue

    if stripped.startswith("#"):
        m = re.match(r"^(#+)\s*(.*)$", stripped)
        level = min(len(m.group(1)), 4)
        h = doc.add_heading("", level=level - 1 if level > 1 else 0)
        add_inline(h, m.group(2))
        i += 1
        continue

    if stripped in ("---", "***", "___"):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(2)
        r = p.add_run("_" * 70)
        r.font.color.rgb = RGBColor(0xBB, 0xBB, 0xBB)
        i += 1
        continue

    if stripped.startswith(">"):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.3)
        add_inline(p, stripped.lstrip("> ").strip())
        for r in p.runs:
            r.italic = True
        i += 1
        continue

    if re.match(r"^[-*]\s+", stripped):
        p = doc.add_paragraph(style="List Bullet")
        add_inline(p, re.sub(r"^[-*]\s+", "", stripped))
        i += 1
        continue

    if re.match(r"^\d+\.\s+", stripped):
        p = doc.add_paragraph(style="List Number")
        add_inline(p, re.sub(r"^\d+\.\s+", "", stripped))
        i += 1
        continue

    if not stripped:
        i += 1
        continue

    # plain paragraph: join continuation lines
    buf = [stripped]
    i += 1
    while i < len(src_lines):
        nxt = src_lines[i].strip()
        if (not nxt or nxt.startswith(("#", "|", "```", ">", "---"))
                or re.match(r"^([-*]|\d+\.)\s+", nxt)):
            break
        buf.append(nxt)
        i += 1
    p = doc.add_paragraph()
    add_inline(p, " ".join(buf))

doc.save(DST)
print("written:", DST)
