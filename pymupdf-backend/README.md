# pymupdf-backend

Python sidecar that gives the DCAP inline editor **sejda-quality**
in-place text editing. PyMuPDF's redact-annotation pipeline actually
rewrites the page's content stream (`Tj` / `TJ` operators), so the
original glyphs are *gone* from the saved PDF — no white-out mask
painted on top, no scar in tinted bands.

The frontend (`src/components/PdfEditorContainer.tsx`) falls back to
local pdf-lib mask-and-draw when `VITE_PYMUPDF_URL` isn't set; when it
is set, the Save handler POSTs the modifications queue to
`/api/edit-text` here and uses the returned bytes as the download.

## License caveat

PyMuPDF is **AGPL-3.0** (or paid commercial). Fine for internal /
server-side use. If you ever bundle this with a closed-source product
you ship to external users, you need a commercial PyMuPDF licence from
Artifex — see https://pymupdf.io/licensing.html. We're using it as a
private sidecar, so AGPL is sufficient.

## Run locally

```bash
cd pymupdf-backend
docker compose up -d
# → http://localhost:8090
```

Then in the app:

```bash
# .env.local
VITE_PYMUPDF_URL=http://localhost:8090
```

A health indicator in the DCAP inline-editor toolbar shows whether the
backend is reachable.

## API

### `GET /api/health`

```json
{ "status": "ok", "pymupdf_version": "1.24.14" }
```

### `POST /api/edit-text`

`multipart/form-data`:

| field   | type                                 | description |
|---------|--------------------------------------|-------------|
| `file`  | binary PDF                           | original   |
| `edits` | JSON string, array of TextModification objects | one per click-edit |

Each `TextModification` matches the frontend's
[`src/utils/pdfLibExporter.ts`](../src/utils/pdfLibExporter.ts) shape:

```json
{
  "pageIndex": 0,
  "xPt": 100.0,
  "yPt": 700.0,
  "widthPt": 50.0,
  "heightPt": 12.0,
  "fontSizePt": 12.0,
  "fontFamily": "Times-Roman",
  "bold": false,
  "italic": false,
  "colorRgb": { "r": 0, "g": 0, "b": 0 },
  "bgRgb": { "r": 1, "g": 1, "b": 1 },
  "newText": "Replacement",
  "adjustedFontSizePt": 12.0
}
```

All coordinates are PDF user-space points, **origin bottom-left**
(PDF native). The service flips the y-axis internally for PyMuPDF's
top-left rect convention.

Response: `application/pdf` bytes of the edited document.

## Deploy

Same shape as `sejda-backend/`. Render / Railway / Fly / Cloud Run:

1. Point at this directory's Dockerfile.
2. Expose port 8090 (or bind `$PORT`).
3. Set `PYMUPDF_ALLOWED_ORIGIN` to your frontend's origin.
4. Set `VITE_PYMUPDF_URL` on the frontend env to the deployed URL.

## Tradeoffs

- **Font fidelity**: standard PDF 14 fonts only (Helvetica, Times-Roman,
  Courier × {regular, bold, italic, bold-italic}). The original
  embedded font of the edited text run isn't preserved — same as
  Acrobat's "Edit text" tool. Going further means extracting the
  source font via `page.get_fonts()` + `extract_font()` and re-embedding
  it; doable but skipped for v1.
- **Redaction can shift line metrics very slightly** if the replacement
  text is far narrower than the original glyph box, because PyMuPDF
  preserves the empty box rather than reflowing. Same caveat as sejda.
