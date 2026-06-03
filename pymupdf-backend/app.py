"""
PyMuPDF sidecar — sejda-quality in-place PDF text editing.

The frontend's PdfEditorContainer collects a list of edits in the
modifications queue (one per pdfjs TextItem the user touched). On Save
it POSTs the original PDF + the JSON-serialised edits to /api/edit-text.
We use PyMuPDF's redact-annotation pipeline to:
  1. Mark each edited glyph run as a redaction rect (real PDF
     content-stream operation — the underlying Tj/TJ operators get
     rewritten, not just covered),
  2. Apply the redactions with replacement text drawn in place.

The result is a PDF where the original text is GONE from the content
stream — same effect as sejda.com's "Edit text" tool, not a paint-over
mask. Tinted bands / coloured backgrounds stay intact because nothing
is being stamped over them.

Coordinate convention from the frontend:
  - All units in PDF user-space points
  - Origin bottom-left (PDF native), y increasing UPWARD
  - xPt, yPt = baseline left of the original glyph run
  - widthPt, heightPt = original glyph bounding box (≈ ascent)
  - fontSizePt = original font size; adjustedFontSizePt = post-fit size

PyMuPDF uses TOP-LEFT origin with y increasing DOWNWARD, so we flip
the y-axis when building each Rect.
"""

from __future__ import annotations

import json
import os
from typing import Any

import fitz  # PyMuPDF
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

app = FastAPI(title="pymupdf-backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("PYMUPDF_ALLOWED_ORIGIN", "*")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "pymupdf_version": fitz.version[0] if hasattr(fitz, "version") else "unknown",
    }


# PyMuPDF's built-in PDF base-14 font short names. We pick the closest
# match for the original family / weight / style. Same fidelity tradeoff
# as the pdf-lib fallback — for exact glyph shapes you'd need to embed
# the original TTF, which would require pulling the font data out of
# the source PDF (PyMuPDF can do it via `page.get_fonts()` + `extract_font()`,
# but not worth the complexity for v1).
def _pick_pymupdf_font(family: str | None, bold: bool, italic: bool) -> str:
    f = (family or "").lower()
    is_mono = any(s in f for s in ("courier", "mono", "consolas"))
    is_serif = any(s in f for s in ("times", "roman", "serif", "georgia", "cambria"))
    if is_mono:
        if bold and italic:
            return "cobi"
        if bold:
            return "cobo"
        if italic:
            return "coit"
        return "cour"
    if is_serif:
        if bold and italic:
            return "tibi"
        if bold:
            return "tibo"
        if italic:
            return "tiit"
        return "tiro"
    if bold and italic:
        return "hebi"
    if bold:
        return "hebo"
    if italic:
        return "heit"
    return "helv"


@app.post("/api/edit-text")
async def edit_text(
    file: UploadFile = File(...),
    edits: str = Form(...),
) -> Response:
    # Parse the edits payload up-front so we can return a 400 before
    # spinning up the PDF parser if it's malformed.
    try:
        edits_list = json.loads(edits)
        if not isinstance(edits_list, list):
            raise ValueError("'edits' must be a JSON array")
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid edits payload: {e}")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty PDF upload")

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot open PDF: {e}")

    # Group edits by page so we apply all redactions on a page in one
    # apply_redactions() call — PyMuPDF rewrites the content stream
    # once per call, so batching matters for perf on heavily-edited
    # pages.
    by_page: dict[int, list[dict]] = {}
    for edit in edits_list:
        try:
            page_idx = int(edit["pageIndex"])
        except (KeyError, TypeError, ValueError):
            continue
        by_page.setdefault(page_idx, []).append(edit)

    try:
        for page_idx, page_edits in by_page.items():
            if page_idx < 0 or page_idx >= doc.page_count:
                continue
            page = doc[page_idx]
            page_height = page.rect.height
            for edit in page_edits:
                try:
                    x_pt = float(edit["xPt"])
                    y_pt_baseline = float(edit["yPt"])
                    w_pt = float(edit["widthPt"])
                    h_pt = float(edit.get("heightPt", edit["fontSizePt"]))
                    font_size_orig = float(edit["fontSizePt"])
                    font_size_use = float(edit.get("adjustedFontSizePt") or font_size_orig)
                    new_text = str(edit.get("newText", ""))
                    color = edit.get("colorRgb", {"r": 0.07, "g": 0.07, "b": 0.07})
                    bg = edit.get("bgRgb", {"r": 1.0, "g": 1.0, "b": 1.0})
                except (KeyError, TypeError, ValueError):
                    # Malformed individual edit — skip it but keep going
                    # on the rest of the page. The user gets a quietly-
                    # smaller edit count rather than a 500.
                    continue

                # 0.18 × font descent is enough to cover g/p/y/q tails;
                # any more starts climbing into the previous line.
                descent = font_size_orig * 0.18
                # Convert PDF native (bottom-left) → PyMuPDF top-left.
                # left/right stay the same; top/bottom flip and swap.
                pad = 0.5
                top_y = page_height - y_pt_baseline - h_pt - pad
                bot_y = page_height - y_pt_baseline + descent + pad
                rect = fitz.Rect(
                    x_pt - pad,
                    top_y,
                    x_pt + w_pt + pad,
                    bot_y,
                )

                font_name = _pick_pymupdf_font(
                    edit.get("fontFamily"),
                    bool(edit.get("bold", False)),
                    bool(edit.get("italic", False)),
                )

                # Sejda-style "true edit": the redact annot removes the
                # original glyphs from the content stream, then the
                # `text=` argument re-draws the user's replacement in
                # their picked font + size. `cross_out=False` suppresses
                # PyMuPDF's default cross-out line, `fill` keeps the
                # band's tint by painting the sampled bg under the new
                # text (in case the redaction leaves a faint scar).
                page.add_redact_annot(
                    rect,
                    text=new_text,
                    fontname=font_name,
                    fontsize=font_size_use,
                    text_color=(
                        float(color.get("r", 0.07)),
                        float(color.get("g", 0.07)),
                        float(color.get("b", 0.07)),
                    ),
                    fill=(
                        float(bg.get("r", 1.0)),
                        float(bg.get("g", 1.0)),
                        float(bg.get("b", 1.0)),
                    ),
                    align=0,  # fitz.TEXT_ALIGN_LEFT
                    cross_out=False,
                )

            # Apply all redactions registered on this page. Keep images
            # and line-art untouched (default), only redact text.
            page.apply_redactions(
                images=fitz.PDF_REDACT_IMAGE_NONE,
                graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                text=fitz.PDF_REDACT_TEXT_REMOVE,
            )

        # garbage=4 + deflate=True + clean=True shrinks the output a bit
        # by stripping orphaned objects and compressing streams — same
        # flags the PyMuPDF docs use in their "Save with options" sample.
        out_bytes = doc.write(garbage=4, deflate=True, clean=True)
    finally:
        doc.close()

    return Response(
        content=bytes(out_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="edited.pdf"'},
    )
