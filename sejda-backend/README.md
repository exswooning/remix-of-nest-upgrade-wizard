# sejda-backend

Java / Spring Boot service that wraps the [Sejda](https://github.com/torakiki/sejda) PDF library
and exposes its operations as REST endpoints. The CGAP / DCAP frontend calls
this when `VITE_SEJDA_BACKEND_URL` is set + the user toggles "Use Sejda backend"
on the DCAP tab.

Same library that powers sejda.com. No quota — your code runs on your host.

## Endpoints (v0.1)

| Method | Path             | Params                                       | Returns        |
| ------ | ---------------- | -------------------------------------------- | -------------- |
| GET    | `/api/health`    | —                                            | `ok`           |
| POST   | `/api/merge`     | `files` (multipart, ≥2 PDFs)                 | merged PDF     |
| POST   | `/api/rotate`    | `file`, `degrees` (90 / 180 / 270)           | rotated PDF    |
| POST   | `/api/extract`   | `file`, `pages` (`"1,3,5-7"`)                | extracted PDF  |
| POST   | `/api/split`     | `file`, `pagesPerChunk` (default 1)          | ZIP of chunks  |

Add more by following the pattern in [PdfController.java](src/main/java/com/nestnepal/sejda/PdfController.java) —
Sejda's task model is uniform: build a `Parameters` object, set the output, call `new XYZTask().execute(params)`.

## Run locally

Requires **Java 21** + **Maven 3.9+**.

```bash
cd sejda-backend
mvn spring-boot:run
# → listens on http://localhost:8089
curl http://localhost:8089/api/health
# → ok
```

Then on the frontend (`.env.local`):

```
VITE_SEJDA_BACKEND_URL=http://localhost:8089
```

…and reload. The DCAP toolbar gains a "Sejda backend" switch — flip it on to route merge / split / rotate / extract through this service.

## Build a fat JAR

```bash
mvn -DskipTests package
java -jar target/sejda-backend-0.1.0.jar
```

## Deploy

The included `Dockerfile` is a two-stage Maven build → slim JRE runtime. Works
on any container host:

- **Render.com**: New → Web Service → connect this repo's `sejda-backend/` sub-directory → it auto-detects the Dockerfile. Free tier sleeps after 15 min of idle; ping `/api/health` from cron-job.org to keep it warm.
- **Railway**: New → Deploy from GitHub → root directory `sejda-backend` → Railway picks the Dockerfile.
- **Fly.io**: `fly launch` from `sejda-backend/` → uses the Dockerfile.

Then set `VITE_SEJDA_BACKEND_URL` to the deployed URL in your Vercel project's env vars.

## Env

| Var                    | Default | Purpose                                     |
| ---------------------- | ------- | ------------------------------------------- |
| `PORT`                 | `8089`  | Server port (set automatically by Render/Railway/Fly) |
| `SEJDA_ALLOWED_ORIGIN` | `*`     | CORS origin allow-list — tighten in prod    |
