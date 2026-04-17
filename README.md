# NeepFeed

Self-hosted Reddit feed aggregator with engagement-weighted scoring, infinite scroll, video autoplay, and per-subreddit customization.

## Stack

- **Backend:** Python 3.12 + Flask + APScheduler + SQLite (WAL + FTS5)
- **Reddit:** PRAW (with mock client for dev before API approval)
- **Frontend:** React 18 + Vite + Tailwind CSS
- **Deploy:** Docker + Docker Compose

## Dev Setup

```bash
# Backend
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    |    Unix: source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env
python app.py

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Backend runs on `http://localhost:5000`, frontend dev server on `http://localhost:5173` (proxies `/api/*` to backend).

## Docker

```bash
docker compose up --build
```

Served on port `5002` (or whatever's mapped in `docker-compose.yml`).

## Status

Reddit API approval pending — development runs against `MockRedditClient` until credentials are available. Once approved, set the Reddit env vars in `.env` and the app will switch to PRAW automatically.

See `NeepFeed-Spec.md` for full specification.
