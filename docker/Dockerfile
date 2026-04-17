# ----- Stage 1: build React frontend -----
FROM node:22-alpine AS frontend

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ----- Stage 2: python runtime -----
FROM python:3.12-slim AS runtime

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

RUN mkdir -p /app/data

EXPOSE 5000

WORKDIR /app/backend
CMD ["python", "app.py"]
