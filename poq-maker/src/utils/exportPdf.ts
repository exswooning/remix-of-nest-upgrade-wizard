/**
 * Capture-to-PDF helper for the QuotePreview surface.
 *
 * Pipeline: html2canvas at 2× device-pixel-ratio for sharp text,
 * then slice the resulting PNG into A4-shaped pages and addImage each
 * slice into a fresh jsPDF document. The slicing path means content
 * taller than one page wraps cleanly across N pages instead of being
 * letter-boxed or clipped.
 *
 * Dynamic imports keep both libraries out of the initial bundle —
 * users pay the parse cost only when they click "Download PDF".
 */

export interface ExportPdfOptions {
  filename?: string;
  /** Render multiplier for html2canvas. 2 ≈ retina; bump to 3 for
   *  print-quality at the cost of canvas memory. */
  scale?: number;
  /** Background color used for the canvas + padding margins. */
  backgroundColor?: string;
  /** Page margin in mm — added inside the PDF page around the image. */
  marginMm?: number;
}

const A4_W_MM = 210;
const A4_H_MM = 297;

export async function exportQuoteToPdf(
  element: HTMLElement,
  opts: ExportPdfOptions = {},
): Promise<void> {
  const {
    filename = "quote.pdf",
    scale = 2,
    backgroundColor = "#ffffff",
    marginMm = 0,
  } = opts;

  // Lazy-load to keep the libraries off the initial route bundle.
  const [{ default: html2canvas }, jspdfModule] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  // jspdf v3 exports as named `jsPDF` AND default — handle both.
  const jsPDF = (jspdfModule as unknown as { jsPDF?: typeof import("jspdf").jsPDF }).jsPDF
    ?? (jspdfModule as unknown as { default: typeof import("jspdf").jsPDF }).default;

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor,
    logging: false,
    // Render the element at its native pixel size so layout maths
    // doesn't get warped by a zoomed viewport.
    windowWidth: element.offsetWidth,
    windowHeight: element.offsetHeight,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWmm = A4_W_MM - marginMm * 2;
  const pageHmm = A4_H_MM - marginMm * 2;
  const imgWPx = canvas.width;
  const imgHPx = canvas.height;
  // mm per source-pixel — derived from the page-width fit.
  const mmPerPx = pageWmm / imgWPx;
  const totalHmm = imgHPx * mmPerPx;
  const pages = Math.max(1, Math.ceil(totalHmm / pageHmm));

  if (pages === 1) {
    // Single-page fast path.
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      marginMm,
      marginMm,
      pageWmm,
      totalHmm,
      undefined,
      "FAST",
    );
    pdf.save(filename);
    return;
  }

  // Multi-page slice path. Each iteration crops `pageHpx` rows of
  // source pixels into a temp canvas, encodes that as a PNG, and
  // stamps it into the right offset on a fresh PDF page.
  const sliceCanvas = document.createElement("canvas");
  sliceCanvas.width = imgWPx;
  const sliceCtx = sliceCanvas.getContext("2d");
  if (!sliceCtx) throw new Error("Could not create slice canvas context");

  const pageHpx = Math.floor(pageHmm / mmPerPx);
  for (let i = 0; i < pages; i++) {
    const sy = i * pageHpx;
    const sliceH = Math.min(pageHpx, imgHPx - sy);
    sliceCanvas.height = sliceH;
    sliceCtx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    sliceCtx.drawImage(canvas, 0, sy, imgWPx, sliceH, 0, 0, imgWPx, sliceH);
    if (i > 0) pdf.addPage();
    pdf.addImage(
      sliceCanvas.toDataURL("image/png"),
      "PNG",
      marginMm,
      marginMm,
      pageWmm,
      sliceH * mmPerPx,
      undefined,
      "FAST",
    );
  }
  pdf.save(filename);
}
