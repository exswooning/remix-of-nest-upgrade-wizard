/**
 * Build the Nest Nepal contract as a real `.docx` — programmatically, via
 * the `docx` library. Two modes:
 *   - 'filled'   → substituted form values, ready to send to a client.
 *   - 'template' → `{placeholder}` literals preserved, so power users can
 *     download as a starter, customise in Word, then re-upload into the
 *     existing custom-template card.
 *
 * The layout mirrors `generateContractPdf` (two-column section table,
 * bordered signature page, running header, page footer) so the .docx
 * output reads like the PDF — just editable.
 *
 * Lives in a separate file from `contractTemplate.ts` so the `docx`
 * dependency only loads when this is actually called (lazy-imported by
 * the caller).
 */

import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  WidthType,
  HeightRule,
  Packer,
  ShadingType,
  PageBreak,
  UnderlineType,
} from 'docx';
import {
  SECTIONS,
  buildDocxValueMap,
  type ContractFields,
  type ContractSection,
  type SectionBlock,
} from './contractTemplate';

export type DocxBuildMode = 'filled' | 'template';

/** Font sizes in docx are half-points. 22 = 11pt, 26 = 13pt, 28 = 14pt. */
const FONT = 'Times New Roman';
const SIZE_BODY = 22;
const SIZE_H2 = 24;
const SIZE_TITLE = 28;
const SIZE_ID = 26;

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: '000000' };

/** Substitute `{token}` with either the form value (filled mode) or leave
 *  the literal `{token}` in place (template mode). Values are wrapped in
 *  `**…**` markers so the rich-text parser can apply bold-italic emphasis
 *  to user-supplied data. */
function fillTokens(text: string, fields: ContractFields, mode: DocxBuildMode): string {
  if (mode === 'template') return text; // leave {placeholders} as literals
  const map = buildDocxValueMap(fields);
  return text.replace(/\{(\w+)\}/g, (_, k) => {
    const v = (map as Record<string, unknown>)[k];
    if (v === undefined || v === '') return `{${k}}`;
    return `**${String(v)}**`;
  });
}

/** Parse `**bold**` markers and produce a list of TextRuns with the
 *  appropriate styling. Used everywhere we need inline rich text. */
function parseRichRuns(text: string, baseSize = SIZE_BODY): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      runs.push(new TextRun({ text: text.slice(last, m.index), font: FONT, size: baseSize }));
    }
    runs.push(new TextRun({ text: m[1], font: FONT, size: baseSize, bold: true, italics: true }));
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    runs.push(new TextRun({ text: text.slice(last), font: FONT, size: baseSize }));
  }
  return runs.length ? runs : [new TextRun({ text, font: FONT, size: baseSize })];
}

/** Render a single SectionBlock as one or more Paragraphs. */
function blockToParagraphs(block: SectionBlock, fields: ContractFields, mode: DocxBuildMode): Paragraph[] {
  const text = block.text ? fillTokens(block.text, fields, mode) : '';
  switch (block.type) {
    case 'p':
      return [new Paragraph({
        children: parseRichRuns(text),
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120 },
      })];
    case 'sub':
      return [new Paragraph({
        children: [new TextRun({
          text: text.replace(/\*\*/g, ''),
          font: FONT, size: SIZE_BODY, bold: true,
          underline: { type: UnderlineType.SINGLE },
        })],
        spacing: { before: 80, after: 40 },
      })];
    case 'list':
      // Hang-indent: detect "(i)" or "A." prefix; the docx library doesn't
      // give us first-line/hanging out of the box without a numbering
      // definition, so we approximate via paragraph indent.
      return [new Paragraph({
        children: parseRichRuns(text),
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 480, hanging: 360 },
        spacing: { after: 80 },
      })];
    case 'bullet':
      return [new Paragraph({
        children: parseRichRuns(text),
        bullet: { level: 0 },
        spacing: { after: 40 },
      })];
    case 'kv':
      // Bank-detail line: bold key + bold-italic value.
      return [new Paragraph({
        children: [
          new TextRun({ text: (block.key ?? '') + ' ', font: FONT, size: SIZE_BODY, bold: true }),
          new TextRun({
            text: fillTokens(block.value ?? '', fields, mode).replace(/\*\*/g, ''),
            font: FONT, size: SIZE_BODY, bold: true, italics: true,
          }),
        ],
        spacing: { after: 60 },
      })];
  }
  return [];
}

/** Numbered sections render as a 2-column borderless table — label
 *  on the left (~22% width), body on the right (~78%). Mirrors the
 *  PDF generator's layout. */
function sectionToTable(section: ContractSection, fields: ContractFields, mode: DocxBuildMode): Table {
  const labelText = `${section.number} ${section.title ?? ''}`;
  const labelCell = new TableCell({
    width: { size: 22, type: WidthType.PERCENTAGE },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    margins: { top: 60, bottom: 60, left: 0, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({ text: labelText, font: FONT, size: SIZE_BODY, bold: true })],
    })],
  });
  const bodyCell = new TableCell({
    width: { size: 78, type: WidthType.PERCENTAGE },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    margins: { top: 60, bottom: 60, left: 0, right: 0 },
    children: section.blocks.flatMap((b) => blockToParagraphs(b, fields, mode)),
  });
  return new Table({
    rows: [new TableRow({ children: [labelCell, bodyCell] })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2200, 7800],
  });
}

/** Cost-of-services table (Annex B). Renders the line items from
 *  `fields.cost_items`. In template mode (no values), we still render a
 *  one-row "{description} | {qty} | {unit_price_formatted} | {total_formatted}"
 *  example so users see the structure. */
function costTable(fields: ContractFields, mode: DocxBuildMode): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: ['#', 'Description', 'Qty', 'Unit (NRs.)', 'Total (NRs.)'].map((h, i) => new TableCell({
      width: { size: [6, 52, 10, 16, 16][i], type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.SOLID, color: 'CCFBF1', fill: 'CCFBF1' },
      borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
      children: [new Paragraph({
        children: [new TextRun({ text: h, font: FONT, size: SIZE_BODY, bold: true })],
        alignment: i === 1 ? AlignmentType.LEFT : (i === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT),
      })],
    })),
  });

  const items = (fields.cost_items ?? []).filter((r) => r.description.trim());
  const dataRows: TableRow[] = [];

  if (mode === 'template' || items.length === 0) {
    // Single placeholder row showing the loop syntax/columns
    const isTpl = mode === 'template';
    dataRows.push(new TableRow({
      children: [
        isTpl ? '{#items}' : '1',
        isTpl ? '{description}' : '—',
        isTpl ? '{qty}' : '—',
        isTpl ? '{unit_price_formatted}' : '—',
        isTpl ? '{total_formatted}' : '—',
      ].map((c, i) => new TableCell({
        width: { size: [6, 52, 10, 16, 16][i], type: WidthType.PERCENTAGE },
        borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
        children: [new Paragraph({
          children: [new TextRun({ text: c, font: FONT, size: SIZE_BODY })],
          alignment: i >= 2 ? AlignmentType.RIGHT : AlignmentType.LEFT,
        })],
      })),
    }));
    if (isTpl) {
      // Close the loop in a placeholder row
      dataRows.push(new TableRow({
        children: ['{/items}', '', '', '', ''].map((c, i) => new TableCell({
          width: { size: [6, 52, 10, 16, 16][i], type: WidthType.PERCENTAGE },
          borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
          children: [new Paragraph({ children: [new TextRun({ text: c, font: FONT, size: SIZE_BODY })] })],
        })),
      }));
    }
  } else {
    let total = 0;
    items.forEach((r, idx) => {
      const qty = parseFloat(r.qty || '0') || 0;
      const unit = parseFloat(r.unitPrice || '0') || 0;
      const rowTotal = qty * unit;
      total += rowTotal;
      dataRows.push(new TableRow({
        children: [
          String(idx + 1),
          r.description,
          String(qty),
          unit.toLocaleString('en-IN'),
          rowTotal.toLocaleString('en-IN'),
        ].map((c, i) => new TableCell({
          width: { size: [6, 52, 10, 16, 16][i], type: WidthType.PERCENTAGE },
          borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
          children: [new Paragraph({
            children: [new TextRun({ text: c, font: FONT, size: SIZE_BODY })],
            alignment: i >= 2 ? AlignmentType.RIGHT : AlignmentType.LEFT,
          })],
        })),
      }));
    });
    // Grand total row
    dataRows.push(new TableRow({
      children: [
        new TableCell({
          columnSpan: 4,
          borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
          children: [new Paragraph({
            children: [new TextRun({ text: 'Grand Total', font: FONT, size: SIZE_BODY, bold: true })],
            alignment: AlignmentType.RIGHT,
          })],
        }),
        new TableCell({
          borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
          children: [new Paragraph({
            children: [new TextRun({ text: `NRs. ${total.toLocaleString('en-IN')}`, font: FONT, size: SIZE_BODY, bold: true })],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      ],
    }));
  }

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/** Signature page — bordered 2-column table, mirrors the PDF generator. */
function signatureTable(fields: ContractFields, mode: DocxBuildMode): Table {
  const value = (k: keyof ContractFields) => mode === 'template' ? `{${k}}` : (fields[k] as string ?? '');

  const headerCell = (text: string) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, font: FONT, size: SIZE_BODY, bold: true })],
    })],
  });
  const valueCell = (text: string, h = 480) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    height: { value: h, rule: HeightRule.ATLEAST },
    borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONT, size: SIZE_BODY })],
    })],
  });

  const rows: TableRow[] = [
    new TableRow({ tableHeader: true, children: [headerCell('FOR THE CLIENT'), headerCell('FOR THE SERVICE PROVIDER')] }),
    new TableRow({ children: [headerCell('Signed By'), headerCell('Signed By')] }),
    new TableRow({ children: [valueCell(value('signatory_name')), valueCell(value('sp_signatory_name'))] }),
    new TableRow({ children: [headerCell('Title'), headerCell('Title')] }),
    new TableRow({ children: [valueCell(value('signatory_title')), valueCell(value('sp_signatory_title'))] }),
    new TableRow({ children: [headerCell('Signature'), headerCell('Signature')] }),
    new TableRow({ children: [valueCell('', 1500), valueCell('', 1500)] }),
    new TableRow({ children: [headerCell('With the witness of'), headerCell('With the witness of')] }),
    new TableRow({ children: [headerCell('Name'), headerCell('Name')] }),
    new TableRow({ children: [valueCell(value('witness_name')), valueCell(value('sp_witness_name'))] }),
    new TableRow({ children: [headerCell('Designation'), headerCell('Designation')] }),
    new TableRow({ children: [valueCell(value('witness_designation')), valueCell(value('sp_witness_designation'))] }),
    new TableRow({ children: [headerCell('Signature'), headerCell('Signature')] }),
    new TableRow({ children: [valueCell('', 1500), valueCell('', 1500)] }),
  ];

  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

/** Build the full contract document. */
export async function buildContractDocx(
  fields: ContractFields,
  mode: DocxBuildMode = 'filled',
): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];

  // Title — centred, all caps, bold.
  const titleText = mode === 'template'
    ? 'CONTRACT AGREEMENT FOR {product} SERVICES'.toUpperCase()
    : `CONTRACT AGREEMENT FOR ${(fields.product || '').toUpperCase()} SERVICES`;
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 240 },
    children: [new TextRun({ text: titleText, font: FONT, size: SIZE_TITLE, bold: true })],
  }));

  // Contract ID — centred, bold, underlined.
  const idText = mode === 'template'
    ? 'CONTRACT IDENTIFICATION No. {contract_id}'
    : `CONTRACT IDENTIFICATION No. ${fields.contract_id || '—'}`;
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 320 },
    children: [new TextRun({
      text: idText, font: FONT, size: SIZE_ID, bold: true,
      underline: { type: UnderlineType.SINGLE },
    })],
  }));

  for (const section of SECTIONS) {
    if (section.annexTitle) {
      // Annex page — full-width centred title + optional subtitle + body.
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 360, after: 200 },
        pageBreakBefore: section.pageBreakBefore,
        children: [new TextRun({ text: section.annexTitle, font: FONT, size: SIZE_ID, bold: true })],
      }));
      if (section.annexSubtitle) {
        const sub = fillTokens(section.annexSubtitle, fields, mode).replace(/\*\*/g, '');
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: sub, font: FONT, size: SIZE_H2, bold: true })],
        }));
      }
      if (section.annexTitle === 'Annex B: Cost of Services' && section.blocks.length === 0) {
        children.push(costTable(fields, mode));
        continue;
      }
      for (const block of section.blocks) {
        children.push(...blockToParagraphs(block, fields, mode));
      }
      continue;
    }
    if (section.fullWidth) {
      // Preamble — full-width paragraphs.
      for (const block of section.blocks) {
        children.push(...blockToParagraphs(block, fields, mode));
      }
      continue;
    }
    // Numbered section — two-column borderless table.
    if (section.number) {
      children.push(sectionToTable(section, fields, mode));
    }
  }

  // Signature page — forced to a fresh page so signatures never split.
  children.push(new Paragraph({
    pageBreakBefore: true,
    spacing: { after: 200 },
    children: [new TextRun({ text: ' ' })], // intentional spacer
  }));
  children.push(signatureTable(fields, mode));

  // Running header: contract_id (left), CONTRACT AGREEMENT (centre).
  // The two are separated by a tab so they balance across the header.
  const headerIdText = mode === 'template' ? '{contract_id}' : (fields.contract_id || '');
  const header = new Header({
    children: [new Paragraph({
      tabStops: [{ position: 4500, type: 'center' as never }, { position: 9000, type: 'right' as never }],
      children: [
        new TextRun({ text: headerIdText, font: FONT, size: 20, bold: true }),
        new TextRun({ text: '\t', font: FONT }),
        new TextRun({ text: 'CONTRACT AGREEMENT', font: FONT, size: 20, bold: true }),
      ],
    })],
  });

  // Footer: "Page X of N", right-aligned.
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: 'Page ', font: FONT, size: 18 }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, bold: true }),
        new TextRun({ text: ' of ', font: FONT, size: 18 }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, bold: true }),
      ],
    })],
  });

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: SIZE_BODY } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }, // ~19 mm
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children,
    }],
  });

  return await Packer.toBlob(doc);
}
