# PyMuPDF sidecar for the DCAP inline editor. Tiny Python 3.12 service
# that does real text-stream redaction + replacement (sejda-quality)
# instead of the pdf-lib mask-and-draw fallback the frontend ships
# locally.
FROM python:3.12-slim AS runner

WORKDIR /app

# PyMuPDF ships pre-built wheels on PyPI so no system libs (no apt-get
# install of mupdf-dev etc.) are needed — pip handles everything.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Non-root user — same hardening as poq-maker.
RUN useradd --create-home --shell /bin/sh --uid 1001 pymupdf \
    && chown -R pymupdf:pymupdf /app
USER pymupdf

ENV PORT=8090
EXPOSE 8090

# `wget` isn't in slim by default but Python's urllib does the job for
# the compose healthcheck.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
