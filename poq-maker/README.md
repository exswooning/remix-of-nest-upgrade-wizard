# poq-maker

Quote / invoice generator. Live preview + crisp PDF download.

- **Next.js 15** (App Router, Turbopack dev)
- **React 19**
- **Tailwind v4** (`@tailwindcss/postcss`, no config file — theme tokens in `globals.css`)
- **lucide-react** icons
- **html2canvas** + **jsPDF** + **jspdf-autotable** for the export pipeline

## Local dev

```bash
cp .env.example .env
npm install
npm run dev   # http://localhost:3000
```

## Production build

```bash
npm run build && npm start
```

## Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f poq-maker
```

The service binds strictly to `127.0.0.1:3000` — only the host machine
can reach it. Put a reverse proxy (Caddy / Nginx / Traefik) in front
for public access.

Healthcheck pings `wget http://localhost:3000` every 30 s; container is
marked unhealthy after 3 consecutive failures. JSON logs are capped at
10 MB × 3 files = **30 MB total** so the host disk can't be filled by
runaway output.

## File layout

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Landing dashboard — owns quote state, glues form + preview |
| `src/components/QuoteForm.tsx` | Inputs for company / client / meta / line items |
| `src/components/QuotePreview.tsx` | A4-shaped capture target rendered live |
| `src/utils/exportPdf.ts` | `html2canvas` → multi-page `jsPDF` slicer |
| `next.config.ts` | `output: "standalone"` so the Docker image is tiny |
| `postcss.config.mjs` | Tailwind v4 PostCSS plugin |
| `Dockerfile` | Multi-stage `node:22-alpine`, runs as non-root `nextjs` user |
| `docker-compose.yml` | Bind to `127.0.0.1`, healthcheck, log ceiling, bridge net |
