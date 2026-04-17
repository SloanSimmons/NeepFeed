# ----- Stage 1: build React frontend -----
FROM node:22-alpine AS frontend

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ----- Stage 2: python runtime -----
FROM python:3.12-slim AS runtime

# Install dependencies as root, then drop to an unprivileged user at runtime.
RUN groupadd --system --gid 1000 neepfeed \
 && useradd  --system --uid 1000 --gid neepfeed --home-dir /app --shell /usr/sbin/nologin neepfeed

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FLASK_ENV=production \
    DATABASE_PATH=/app/data/neepfeed.db \
    HOST=0.0.0.0 \
    PORT=5000

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# Data dir owned by the unprivileged user so SQLite + WAL files write cleanly.
RUN mkdir -p /app/data \
 && chown -R neepfeed:neepfeed /app

USER neepfeed

EXPOSE 5000

WORKDIR /app/backend
CMD ["python", "app.py"]
