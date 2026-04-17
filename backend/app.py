"""NeepFeed Flask app.

In production, Flask serves the built React SPA from ../frontend/dist.
In dev, run Vite separately and it proxies /api/* here.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from collection import start_scheduler
from db import close_db, init_schema
from routes.blocklist import bp as blocklist_bp
from routes.collect import bp as collect_bp
from routes.feed import bp as feed_bp
from routes.health import bp as health_bp
from routes.lists import bp as lists_bp
from routes.posts import bp as posts_bp
from routes.settings import bp as settings_bp
from routes.stats import bp as stats_bp
from routes.subreddits import bp as subs_bp

load_dotenv()

log = logging.getLogger("neepfeed")
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-5s %(name)s: %(message)s",
)


def create_app() -> Flask:
    # In container, frontend is built to /app/frontend/dist
    # In local dev, that path may not exist; that's fine — Vite serves it.
    dist_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    app = Flask(
        __name__,
        static_folder=str(dist_dir) if dist_dir.exists() else None,
        static_url_path="",
    )

    CORS(app, resources={r"/api/*": {"origins": "*"}})  # LAN-only; relax CORS

    # Init DB
    init_schema()
    app.teardown_appcontext(close_db)

    # API blueprints
    for bp in (health_bp, collect_bp, feed_bp, subs_bp, lists_bp, settings_bp, posts_bp, blocklist_bp, stats_bp):
        app.register_blueprint(bp, url_prefix="/api")

    # Start background collection scheduler
    start_scheduler()

    # SPA fallback: any non-/api route returns index.html so React Router works
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path: str):
        if path.startswith("api/"):
            return jsonify({"error": "not found"}), 404
        if app.static_folder and (Path(app.static_folder) / path).is_file():
            return send_from_directory(app.static_folder, path)
        index = Path(app.static_folder) / "index.html" if app.static_folder else None
        if index and index.is_file():
            return send_from_directory(app.static_folder, "index.html")
        return jsonify({
            "message": "NeepFeed backend up. Frontend dist not built yet — run `npm run build` in frontend/ or use `npm run dev`.",
        }), 200

    log.info("NeepFeed app created. DB=%s static=%s", os.environ.get("DATABASE_PATH"), app.static_folder)
    return app


app = create_app()


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    app.run(host=host, port=port, debug=(os.environ.get("FLASK_ENV") == "development"))
