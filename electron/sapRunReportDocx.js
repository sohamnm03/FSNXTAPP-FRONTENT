// Writes a test run's report as a Word document (.docx): every step in order,
// each followed by the screenshot taken on that step's screen, then the
// assertions, documents and deviations. No dependency: a .docx is a zip of a
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

const run = (text, { bold = false, color = '' } = {}) => `<w:r>${bold || color ? `<w:rPr>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const paragraph = (content, style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${content}</w:p>`;
const text = (value, style = '', options) => paragraph(run(value, options), style);

function table(headers, rows) {
  const cell = (value, bold) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${text(value, '', { bold })}</w:tc>`;
  const row = (values, bold) => `<w:tr>${values.map((value) => cell(value, bold)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="ReportTable"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${row(headers, true)}${rows.map((values) => row(values, false)).join('')}</w:tbl>${paragraph('')}`;
}

const MAX_WIDTH_EMU = 6 * 914400; // 6 inches, fits A4/Letter margins
const EMU_PER_PIXEL = 9525;

function picture(relationshipId, id, size, name) {
  let cx = size.width * EMU_PER_PIXEL;
  let cy = size.height * EMU_PER_PIXEL;
  if (cx > MAX_WIDTH_EMU) { cy = Math.round(cy * MAX_WIDTH_EMU / cx); cx = MAX_WIDTH_EMU; }
  return paragraph(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${xml(name)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${xml(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`);
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="ReportTable"><w:name w:val="Report Table"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

const OUTCOME_COLOR = { ok: '1E7B34', pass: '1E7B34', PASS: '1E7B34', error: 'B42318', fail: 'B42318', FAIL: 'B42318' };

/**
 * report: { caseId, title, systemId, session, runBy, startedAt, verdict, summary,
 *   steps: [{ step, outcome, detail }], assertions: [{ expected, observed, result }],
 *   documents: [{ type, number, leftInPlace }], deviations: [string],
 *   evidence: [{ path, shows, step }] }   // path = absolute image file; step = 1-based step number
 */
function buildRunReportDocx(report) {
  const media = [];
  const relationships = [];
  const pictureFor = (item) => {
    let data;
    try { data = fs.readFileSync(item.path); } catch { return ''; }
    const size = imageSize(data);
    if (!size) return '';
    const index = media.length + 1;
    const name = `image${index}.${size.type === 'png' ? 'png' : 'jpeg'}`;
    media.push({ name: `word/media/${name}`, data });
    const relationshipId = `rIdImage${index}`;
    relationships.push(`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
    return picture(relationshipId, index, size, path.basename(item.path));
  };

  const evidence = Array.isArray(report.evidence) ? report.evidence : [];
  const steps = Array.isArray(report.steps) ? report.steps : [];
  const usedEvidence = new Set();
  const evidenceForStep = (step, index) => evidence.filter((item, at) => {
    const match = Number(item.step) === index + 1
      || (!item.step && item.shows && String(item.shows).trim() === String(step.step || '').trim());
    if (match) usedEvidence.add(at);
    return match;
  });

  const body = [];
  body.push(text(`${report.caseId} — ${report.title || 'Test run report'}`, 'Title'));
  body.push(table(['Item', 'Value'], [
    ['Verdict', report.verdict || 'NOT OBSERVED'],
    ['System', report.systemId || ''],
    ['Session', report.session || 'NOT OBSERVED'],
    ['Run by', report.runBy || ''],
    ['Started', report.startedAt || ''],
  ]));
  if (report.summary) body.push(text(report.summary));

  body.push(text('Steps', 'Heading1'));
  if (!steps.length) body.push(text('No steps were recorded.'));
  steps.forEach((step, index) => {
    body.push(paragraph(run(`Step ${index + 1}: `, { bold: true }) + run(step.step || '')
      + run(`  [${step.outcome || 'NOT OBSERVED'}]`, { bold: true, color: OUTCOME_COLOR[step.outcome] || '' }), 'Heading2'));
    if (step.detail) body.push(text(step.detail));
    for (const item of evidenceForStep(step, index)) body.push(pictureFor(item));
  });

  const leftover = evidence.filter((_, at) => !usedEvidence.has(at));
  if (leftover.length) {
    body.push(text('Other screenshots', 'Heading1'));
    for (const item of leftover) {
      if (item.shows) body.push(text(item.shows));
      body.push(pictureFor(item));
    }
  }

  body.push(text('Assertions', 'Heading1'));
  const assertions = Array.isArray(report.assertions) ? report.assertions : [];
  body.push(assertions.length
    ? table(['#', 'Expected', 'Observed', 'Result'], assertions.map((row, index) => [index + 1, row.expected, row.observed ?? 'NOT OBSERVED', row.result || 'NOT OBSERVED']))
    : text('No assertions were recorded.'));

  body.push(text('Documents created', 'Heading1'));
  const documents = Array.isArray(report.documents) ? report.documents : [];
  body.push(documents.length
    ? table(['Type', 'Number', 'Left in place?'], documents.map((row) => [row.type, row.number || 'NOT OBSERVED', typeof row.leftInPlace === 'boolean' ? (row.leftInPlace ? 'yes' : 'no') : 'NOT OBSERVED']))
    : text('None recorded.'));

  body.push(text('Deviations', 'Heading1'));
  const deviations = Array.isArray(report.deviations) ? report.deviations.filter(Boolean) : [];
  if (deviations.length) deviations.forEach((row) => body.push(text(`• ${row}`)));
  else body.push(text('None'));

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const entries = [
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/document.xml', data: Buffer.from(document) },
    { name: 'word/styles.xml', data: Buffer.from(STYLES) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${relationships.join('')}</Relationships>`) },
    ...media,
  ];
  return zip(entries);
}

module.exports = { buildRunReportDocx, imageSize };
