# IdentityGraph Suvidha Desk — FastAPI
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8001

# System deps (fpdf2 / pillow-friendly fonts optional; ca-certs for HTTPS to Sarvam)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py .
COPY identitygraph/ ./identitygraph/
COPY sample_data/ ./sample_data/

EXPOSE 8001

# Pass API_KEY / SARVAM_API_KEY at runtime, e.g.:
#   docker run -e API_KEY=sk-... -p 8001:8001 identitygraph-api
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT}"]
