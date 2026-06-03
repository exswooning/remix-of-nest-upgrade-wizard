/**
 * Format-template converter — turns a user-supplied .docx or .pdf into
 * the HTML shape the Contract tab's length slider expects (one or more
 * `<div class="contract-page">…</div>` blocks). HTML inputs pass
 * through unchanged.
 *
 * Why HTML is the target: the Contract tab's render path is a
 * sandboxed iframe driven by `fillContractHtmlTemplate` token
 * substitution. Anything we want to use as a length-specific template
 * has to end up as HTML eventually; building the converter here means
 * the user can drag in the format they already have (Word doc, PDF
 * export of a previous contract) instead of hand-translating it.
 *
 * Tech: mammoth (DOCX → semantic HTML, preserves bold / italic / lists
 * / tables) + pdfjs-dist (PDF → per-page absolutely-positioned text
 * spans, preserves layout). Both libs are already in deps.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { ensurePdfjsWorker } from './pdfTools';

export type SupportedFormat = 'html' | 'docx' | 'pdf';

export interface ConversionResult {
  html: string;
  /** Detected page count — drives the length slider's slot. */
  pageCount: number;
  /** Diagnostic messages from the converter (mammoth surfaces warnings
   *  for un-handled Word styles; pdfjs is silent). Shown to the user
   *  as a small "converted with N notes" toast. */
  notes: string[];
}

export function detectFormat(file: File): SupportedFormat | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith('.docx') || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (name.endsWith('.html') || name.endsWith('.htm') || type === 'text/html') return 'html';
  return null;
}

/** docx-preview-based .docx → HTML (layout-preserving).
 *
 *  Replaces an older mammoth-only path that gave semantic HTML but
 *  flattened the Word doc's layout: page breaks vanished, two-column
 *  sections collapsed, fonts / margins / tables lost their fidelity.
 *  docx-preview renders the DOCX to actual HTML+CSS at the same
 *  visual fidelity Word itself does — pages stay paginated, fonts
 *  load via embedded base64, tables keep their column widths, headers
 *  and footers appear, etc.
 *
 *  Pipeline:
 *   1. Render into an off-screen container via `renderAsync`.
 *   2. Rename the per-page `<section class="docx">` elements to
 *      `<div class="contract-page docx">` so the slider's page-count
 *      sniff + the iframe's per-page chrome both find them.
 *   3. Capture the generated `<style>` block + the renamed body as a
 *      single self-contained HTML fragment that survives storage in
 *      localStorage and rendering inside the sandboxed preview iframe.
 *
 *  Falls back to mammoth's semantic conversion on any error so the
 *  upload still produces something usable when docx-preview chokes on
 *  an unusual Word file. */
export async function convertDocxToHtml(file: File): Promise<ConversionResult> {
  try {
    return await convertDocxViaDocxPreview(file);
  } catch (err) {
    console.warn('docx-preview render failed; falling back to mammoth semantic conversion:', err);
    return await convertDocxViaMammoth(file, [
      `docx-preview failed: ${err instanceof Error ? err.message : String(err)}`,
      'Fell back to semantic mammoth conversion — layout may not match the original.',
    ]);
  }
}

async function convertDocxViaDocxPreview(file: File): Promise<ConversionResult> {
  const docxPreview = await import('docx-preview');
  // Off-screen render targets. `bodyHost` is sized to A4 width so any
  // width-relative layout in the source doc lays out at the expected
  // dimensions during the headless render.
  const bodyHost = document.createElement('div');
  bodyHost.style.cssText = 'position:fixed;top:-99999px;left:-99999px;visibility:hidden;width:794px;';
  document.body.appendChild(bodyHost);
  const styleHost = document.createElement('div');
  styleHost.style.cssText = 'display:none;';
  document.body.appendChild(styleHost);
  try {
    await docxPreview.renderAsync(file, bodyHost, styleHost, {
      inWrapper: false,                       // skip the outer .docx-wrapper div
      breakPages: true,                       // honour Word's hard page breaks
      ignoreLastRenderedPageBreak: false,
      experimental: true,                     // better column / table fidelity
      trimXmlDeclaration: true,
      useBase64URL: true,                     // inline images so the HTML is self-contained
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: false,
      renderEndnotes: false,
      ignoreFonts: false,
      ignoreHeight: false,
      ignoreWidth: false,
    });

    // docx-preview emits each page as `<section class="docx">`. Rename
    // to `<div class="contract-page docx">` so both the page-count
    // sniffer (`detectTemplatePageCount`) and the iframe's per-page
    // margin/box-shadow CSS find them. The `docx` class is preserved
    // so docx-preview's stylesheet still applies.
    const pageSections = Array.from(bodyHost.querySelectorAll('section.docx'));
    for (const section of pageSections) {
      const div = document.createElement('div');
      div.className = `contract-page ${section.className}`.replace(/\s+/g, ' ').trim();
      const styleAttr = section.getAttribute('style');
      if (styleAttr) div.setAttribute('style', styleAttr);
      div.innerHTML = section.innerHTML;
      section.parentNode?.replaceChild(div, section);
    }
    const pageCount = bodyHost.querySelectorAll('.contract-page').length || 1;
    const styles = styleHost.innerHTML;
    const body = bodyHost.innerHTML;
    const html = `${styles}\n${body}`;
    return {
      html,
      pageCount,
      notes: pageCount > 1
        ? [`Rendered ${pageCount} pages via docx-preview (layout-preserving)`]
        : [],
    };
  } finally {
    bodyHost.remove();
    styleHost.remove();
  }
}

async function convertDocxViaMammoth(file: File, extraNotes: string[] = []): Promise<ConversionResult> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1.contract-title",
        "p[style-name='Subtitle'] => h2.contract-subtitle",
        "p[style-name='Heading 1'] => h2",
        "p[style-name='Heading 2'] => h3",
      ],
    },
  );
  const inner = result.value;
  const notes = [
    ...extraNotes,
    ...(result.messages || []).map(m => `[${m.type}] ${m.message}`),
  ];
  const html = `<div class="contract-page" style="background:#fff;padding:20mm;font-family:'Times New Roman',Times,serif;font-size:11pt;line-height:1.6;width:210mm;min-height:297mm;box-sizing:border-box;">
${inner}
</div>`;
  return { html, pageCount: 1, notes };
}

/** pdfjs-based .pdf → HTML. Each page becomes a `.contract-page` div
 *  sized to the source page's CSS dimensions, with the text content
 *  as absolutely-positioned spans (preserves the original layout).
 *  The text is editable HTML, so `fillContractHtmlTemplate` can still
 *  substitute tokens, and the page count matches the source PDF so
 *  the slider snaps to the right slot. */
export async function convertPdfToHtml(file: File): Promise<ConversionResult> {
  ensurePdfjsWorker();
  const arrayBuffer = await file.arrayBuffer();
  // Hand pdfjs a copy; the underlying buffer gets detached.
  const bytes = new Uint8Array(arrayBuffer.slice(0));
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const scale = 1.5; // CSS px per PDF point — matches DCAP editor
  const pageBlocks: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const widthPx = viewport.width;
    const heightPx = viewport.height;
    const content = await page.getTextContent();
    const spanHtmls: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (content.items as any[]).forEach((raw) => {
      if (!raw || typeof raw.str !== 'string' || !raw.str.trim()) return;
      const transform: number[] = raw.transform;
      const fontSizePt = Math.hypot(transform[2], transform[3]) || Math.abs(transform[3]) || 10;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const screenTx: number[] = (pdfjsLib as any).Util.transform(viewport.transform, transform);
      const fontSizePx = Math.hypot(screenTx[2], screenTx[3]) || Math.abs(screenTx[3]) || fontSizePt * scale;
      const baselineXPx = screenTx[4];
      const baselineYPx = screenTx[5];
      const leftPx = baselineXPx;
      const topPx = baselineYPx - fontSizePx;
      // HTML-escape the text content so quotes / angle-brackets in the
      // source PDF don't break the resulting markup.
      const safe = String(raw.str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      spanHtmls.push(
        `<span style="position:absolute;left:${leftPx.toFixed(2)}px;top:${topPx.toFixed(2)}px;font-size:${fontSizePx.toFixed(2)}px;font-family:'Times New Roman',Times,serif;white-space:pre;">${safe}</span>`,
      );
    });
    pageBlocks.push(
      `<div class="contract-page" style="position:relative;width:${widthPx.toFixed(0)}px;height:${heightPx.toFixed(0)}px;background:#fff;margin:0 auto;overflow:hidden;">\n${spanHtmls.join('\n')}\n</div>`,
    );
  }
  return {
    html: pageBlocks.join('\n'),
    pageCount: doc.numPages,
    notes: doc.numPages === 1
      ? []
      : [`Imported ${doc.numPages} pages from the PDF`],
  };
}

/** HTML pass-through: the input is already HTML, just return it. The
 *  page-count detection here uses the same `.contract-page` /
 *  `.pdf-page` / `.page` sniff the ContractTab upload handler uses
 *  for the slider slot key — kept in one place so future format
 *  conventions only have to be updated here. */
export async function convertHtmlPassthrough(file: File): Promise<ConversionResult> {
  const html = await file.text();
  let pageCount = 1;
  for (const cls of ['contract-page', 'pdf-page']) {
    const re = new RegExp(`class\\s*=\\s*["'][^"']*\\b${cls}\\b`, 'gi');
    const m = html.match(re);
    if (m && m.length > 0) { pageCount = m.length; break; }
  }
  return { html, pageCount, notes: [] };
}

/** Dispatcher: detects the file's format and converts. Throws if the
 *  format isn't supported so the caller can show a useful error toast. */
export async function convertToHtml(file: File): Promise<ConversionResult & { format: SupportedFormat }> {
  const format = detectFormat(file);
  if (!format) {
    throw new Error(`Unsupported file: ${file.name}. Supported formats: .html, .htm, .docx, .pdf`);
  }
  let result: ConversionResult;
  if (format === 'docx') result = await convertDocxToHtml(file);
  else if (format === 'pdf') result = await convertPdfToHtml(file);
  else result = await convertHtmlPassthrough(file);
  return { ...result, format };
}
