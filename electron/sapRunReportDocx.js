// Renders a run's functional report (see sapRunReport.js) as a Word document:
// summary, objective, test data, step overview, each step's screenshots,
// verification checks, documents and observations. No dependency: a .docx is a zip of a
// few XML parts, written here with Node's own zlib.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const fileName = Buffer.from(name, 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    locals.push(local, fileName, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// Pixel size of a PNG or JPEG, so the picture keeps its proportions in Word.
function imageSize(data) {
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), type: 'png' };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let at = 2;
    while (at + 9 < data.length) {
      if (data[at] !== 0xff) { at++; continue; }
      const marker = data[at + 1];
      const length = data.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: data.readUInt16BE(at + 7), height: data.readUInt16BE(at + 5), type: 'jpeg' };
      }
      at += 2 + length;
    }
  }
  return null;
}

const xml = (value) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Palette: navy headings and table headers, soft grey rules, green/red results.
const NAVY = '1F3864';
const ACCENT = '2E75B6';
const MUTED = '6B7280';
const RULE = 'D0D7E2';
const BAND = 'F3F6FA';
const GOOD = { text: '1E6B34', fill: 'E3F4E8' };
const BAD = { text: '9B1C1C', fill: 'FBE5E5' };
const NEUTRAL = { text: '6B4E00', fill: 'FFF4D6' };

const tone = (status) => (/^(?:passed|pass|yes)$/i.test(status) ? GOOD : /^(?:failed|fail|no)$/i.test(status) ? BAD : NEUTRAL);

const run = (text, { bold = false, italic = false, color = '', size = 0 } = {}) => {
  const props = `${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/>` : ''}`;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
};
const paragraph = (content, { style = '', align = '', after = null, keepNext = false } = {}) => {
  const props = `${style ? `<w:pStyle w:val="${style}"/>` : ''}${keepNext ? '<w:keepNext/>' : ''}${after !== null ? `<w:spacing w:after="${after}"/>` : ''}${align ? `<w:jc w:val="${align}"/>` : ''}`;
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${content}</w:p>`;
};
const text = (value, options = {}, runOptions = {}) => paragraph(run(value, runOptions), options);

const TEXT_WIDTH = 9638; // A4 width minus both margins, in twips
const twips = (fiftieths) => Math.round(TEXT_WIDTH * fiftieths / 5000);
const grid = (widths) => `<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${twips(width)}"/>`).join('')}</w:tblGrid>`;
const TABLE_PROPS = '<w:tblStyle w:val="ReportTable"/><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/>';

function cell(content, { width = 0, fill = '', bold = false, color = '', align = '', span = 1 } = {}) {
  const props = `${width ? `<w:tcW w:w="${twips(width)}" w:type="dxa"/>` : ''}${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}<w:vAlign w:val="center"/>`;
  const body = typeof content === 'string' ? paragraph(run(content, { bold, color }), { align, after: 0 }) : content.join('');
  return `<w:tc><w:tcPr>${props}</w:tcPr>${body}</w:tc>`;
}

// widths are fiftieths of a percent (5000 = full width).
function table(headers, rows, widths = headers.map(() => Math.floor(5000 / headers.length))) {
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers.map((header, index) => cell(header, { width: widths[index], fill: NAVY, bold: true, color: 'FFFFFF' })).join('')}</w:tr>`;
  const body = rows.map((values, rowIndex) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${values.map((value, index) => {
    if (value && typeof value === 'object' && value.status) {
      const colors = tone(value.status);
      return cell(value.status, { width: widths[index], fill: colors.fill, bold: true, color: colors.text, align: 'center' });
    }
    return cell(String(value ?? ''), { width: widths[index], fill: rowIndex % 2 ? BAND : '' });
  }).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr>${TABLE_PROPS}</w:tblPr>${grid(widths)}${head}${body}</w:tbl>${paragraph('', { after: 120 })}`;
}

// Label/value pairs, labels shaded, used for the summary block.
function factTable(pairs) {
  const rows = pairs.map(([label, value]) => {
    const valueCell = value && typeof value === 'object' && value.status
      ? cell(value.status, { width: 3600, fill: tone(value.tone || value.status).fill, bold: true, color: tone(value.tone || value.status).text })
      : cell(String(value ?? ''), { width: 3600 });
    return `<w:tr>${cell(label, { width: 1400, fill: BAND, bold: true, color: NAVY })}${valueCell}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr>${TABLE_PROPS}</w:tblPr>${grid([1400, 3600])}${rows}</w:tbl>${paragraph('', { after: 120 })}`;
}

const MAX_WIDTH_EMU = Math.round(6.2 * 914400);
const EMU_PER_PIXEL = 9525;

function picture(relationshipId, id, size, name) {
  let cx = size.width * EMU_PER_PIXEL;
  let cy = size.height * EMU_PER_PIXEL;
  if (cx > MAX_WIDTH_EMU) { cy = Math.round(cy * MAX_WIDTH_EMU / cx); cx = MAX_WIDTH_EMU; }
  return paragraph(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${xml(name)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${xml(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="9525"><a:solidFill><a:srgbClr val="${RULE}"/></a:solidFill></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`, { align: 'center', after: 40 });
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/><w:color w:val="1F2933"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="${ACCENT}"/></w:pBdr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="3" w:color="${RULE}"/></w:pBdr><w:spacing w:before="360" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="${ACCENT}"/><w:sz w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:rPr><w:i/><w:color w:val="${MUTED}"/><w:sz w:val="17"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${RULE}"/></w:pBdr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="16"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="ReportTable"><w:name w:val="Report Table"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="${RULE}"/><w:left w:val="single" w:sz="4" w:color="${RULE}"/><w:bottom w:val="single" w:sz="4" w:color="${RULE}"/><w:right w:val="single" w:sz="4" w:color="${RULE}"/><w:insideH w:val="single" w:sz="4" w:color="${RULE}"/><w:insideV w:val="single" w:sz="4" w:color="${RULE}"/></w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

function footer(caseId) {
  const field = (instruction) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs></w:pPr>${run(`${caseId} · Test Execution Report`)}<w:r><w:tab/></w:r>${run('Page ')}${field('PAGE')}${run(' of ')}${field('NUMPAGES')}</w:p></w:ftr>`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * report: the functional model from sapRunReport.buildFunctionalReport.
 */
function buildRunReportDocx(report) {
  const media = [];
  const relationships = [];
  let figure = 0;
  const pictureFor = (shot, caption) => {
    let data;
    try { data = fs.readFileSync(shot.path); } catch { return ''; }
    const size = imageSize(data);
    if (!size) return '';
    const index = media.length + 1;
    const name = `image${index}.${size.type === 'png' ? 'png' : 'jpeg'}`;
    media.push({ name: `word/media/${name}`, data });
    const relationshipId = `rIdImage${index}`;
    relationships.push(`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
    figure += 1;
    return picture(relationshipId, index, size, path.basename(shot.path)) + text(`Figure ${figure} — ${caption}`, { style: 'Caption' });
  };

  const body = [];
  body.push(text('Test Execution Report', { style: 'Title' }));
  body.push(text(`${report.caseId}${report.title ? ` — ${report.title}` : ''}`, { style: 'Subtitle' }));

  body.push(factTable([
    ['Result', { status: report.result, tone: report.passed ? 'passed' : /fail/i.test(report.result) ? 'failed' : 'other' }],
    ['Test case', report.caseId],
    ['System', report.systemId],
    ['Executed by', report.runBy || '—'],
    ['Executed on', formatDate(report.startedAt)],
    ['Steps', report.stepsSummary],
    ...(report.checksSummary ? [['Checks', report.checksSummary]] : []),
    ...(report.documents.length ? [['Documents created', report.documents.map((row) => `${row.type} ${row.number}`).join(', ')]] : []),
  ]));

  if (report.objective) {
    body.push(text('Objective', { style: 'Heading1' }));
    body.push(text(report.objective));
  }

  if (report.testData.length) {
    body.push(text('Test data', { style: 'Heading1' }));
    body.push(table(['Field', 'Value'], report.testData.map((row) => [row.field, row.value]), [2000, 3000]));
  }

  body.push(text('Step overview', { style: 'Heading1' }));
  body.push(report.steps.length
    ? table(['#', 'Action', 'Input', 'Result'], report.steps.map((step, index) => [index + 1, step.action, step.input, { status: step.status }]), [350, 2550, 1350, 750])
    : text('No steps were recorded.'));

  if (report.steps.some((step) => step.screenshots.length || step.note)) {
    body.push(text('Step details and screenshots', { style: 'Heading1' }));
    report.steps.forEach((step, index) => {
      if (!step.screenshots.length && !step.note) return;
      const colors = tone(step.status);
      body.push(paragraph(run(`Step ${index + 1}  `, { color: MUTED }) + run(step.action) + run(`   ${step.status}`, { bold: true, color: colors.text, size: 18 }), { style: 'Heading2' }));
      if (step.input) body.push(text(step.input, {}, { color: MUTED }));
      if (step.note) body.push(paragraph(run('What happened: ', { bold: true, color: colors.text }) + run(step.note)));
      for (const shot of step.screenshots) body.push(pictureFor(shot, `Screen after step ${index + 1}: ${step.action}`));
    });
  }

  if (report.otherScreenshots.length) {
    body.push(text('Additional screenshots', { style: 'Heading1' }));
    for (const shot of report.otherScreenshots) body.push(pictureFor(shot, shot.caption || 'Screenshot'));
  }

  if (report.checks.length) {
    body.push(text('Verification checks', { style: 'Heading1' }));
    body.push(table(['Check', 'Expected', 'Actual', 'Result'], report.checks.map((row) => [row.check, row.expected, row.actual, { status: row.passed ? 'Passed' : 'Failed' }]), [1500, 1250, 1500, 750]));
  }

  if (report.documents.length) {
    body.push(text('Documents created', { style: 'Heading1' }));
    body.push(table(['Document', 'Number'], report.documents.map((row) => [row.type, row.number]), [2500, 2500]));
  }

  body.push(text('Observations', { style: 'Heading1' }));
  if (report.issues.length) report.issues.forEach((issue) => body.push(paragraph(run('•  ', { color: ACCENT, bold: true }) + run(issue))));
  else body.push(text('No issues were observed during this run.'));

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const entries = [
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/document.xml', data: Buffer.from(document) },
    { name: 'word/styles.xml', data: Buffer.from(STYLES) },
    { name: 'word/footer1.xml', data: Buffer.from(footer(report.caseId)) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${relationships.join('')}</Relationships>`) },
    ...media,
  ];
  return zip(entries);
}

module.exports = { buildRunReportDocx, imageSize };
