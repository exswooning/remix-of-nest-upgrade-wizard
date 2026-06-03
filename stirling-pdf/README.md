# Stirling PDF — DCAP's "Sejda clone" backend

[Stirling PDF](https://github.com/Stirling-Tools/Stirling-PDF) is an
open-source, self-hosted PDF toolkit with a polished web UI — the
closest practical equivalent of sejda.com you can run yourself without
paying for a commercial SDK. The DCAP tab in this app iframes it when
`VITE_STIRLING_URL` is set.

## What Stirling can do

Merge · Split · Rotate · Extract · Crop · Compress · Watermark · Add
page numbers · Header/footer · OCR · Sign (draw / type / upload) ·
Add text · Add image · Annotate · Redact · White-out · Edit metadata ·
Form fill · PDF → Word / Excel / Image · Image → PDF · HTML → PDF ·
Markdown → PDF · Encrypt / decrypt · Repair · Compare · Flatten · much
more.

## Run it

```bash
cd stirling-pdf
docker compose up -d
open http://localhost:8084
```

First boot pulls the image (~1 GB) and takes 30-60 seconds to start.

Subsequent boots are fast.

## Wire it into the DCAP tab

In the SPA's `.env.local`:

```
VITE_STIRLING_URL=http://localhost:8084
```

Reload the dev server. The DCAP tab now shows Stirling embedded as an
iframe — the same UI you'd see at `http://localhost:8084` direct.

If `VITE_STIRLING_URL` is unset, DCAP falls back to the existing
pdf-lib tile grid (merge / split / rotate / OCR / etc. all
browser-side).

## Production deployment

Stirling is a Java/Spring Boot app — runs anywhere Docker runs:
Render.com, Railway, Fly.io, your own VPS. After deploying, set
`VITE_STIRLING_URL` in the SPA's hosting env vars to the public URL.

For production you'll want to:
- Set `DOCKER_ENABLE_SECURITY=true` in docker-compose
- Configure auth via `/configs/settings.yml` (see Stirling docs)
- Tighten CORS / `ALLOWED_HOST_ORIGIN` to just the SPA's hostname

## Storage

The compose file mounts three host directories:

| Path | What's stored |
| --- | --- |
| `./training-data` | Tesseract OCR language files (downloaded on first use) |
| `./extra-configs` | Server config (`settings.yml`, security, etc.) |
| `./custom-files` | Custom templates / signatures uploaded by users |
| `./logs` | Stirling application logs |

These are all bind mounts, so they survive `docker compose down`.
