"""URL normalization + hashing for cross-post deduplication.

Two posts are considered cross-posts of the same content if they share the same
normalized URL hash. We strip tracking params, lowercase the host, drop the
fragment, and normalize a few common aliases (youtu.be -> youtube.com/watch).
"""
from __future__ import annotations

import hashlib
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

# Query params to drop on normalization (tracking & share markers)
_DROP_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "ref", "ref_src", "ref_url", "share_id", "si", "feature",
    "igshid", "mc_cid", "mc_eid",
}


def normalize_url(url: str) -> str:
    if not url:
        return ""
    try:
        p = urlparse(url.strip())
    except Exception:
        return url.strip().lower()

    host = (p.netloc or "").lower()
    # Strip www.
    if host.startswith("www."):
        host = host[4:]

    path = p.path or "/"
    # Collapse trailing slash (but keep "/" for root)
    if len(path) > 1 and path.endswith("/"):
        path = path[:-1]

    # Common aliases
    if host == "youtu.be":
        # youtu.be/ID -> youtube.com/watch?v=ID
        video_id = path.lstrip("/")
        host = "youtube.com"
        path = "/watch"
        qs = dict(parse_qsl(p.query, keep_blank_values=False))
        qs["v"] = video_id
        query_items = [(k, v) for k, v in sorted(qs.items()) if k not in _DROP_PARAMS]
    elif host.endswith("reddit.com") and path.startswith("/r/"):
        # /r/sub/comments/abc/title/  ->  /r/sub/comments/abc
        parts = path.strip("/").split("/")
        if len(parts) >= 4 and parts[2] == "comments":
            path = "/" + "/".join(parts[:4])
        query_items = []
    else:
        query_items = [
            (k, v) for k, v in parse_qsl(p.query, keep_blank_values=False)
            if k.lower() not in _DROP_PARAMS
        ]
        query_items.sort()

    # Drop fragment
    return urlunparse((p.scheme.lower() or "https", host, path, "", urlencode(query_items), ""))


def url_hash(url: str) -> str:
    """SHA1 of normalized URL, truncated to 16 hex chars (~64 bits, collision-safe for our scale)."""
    norm = normalize_url(url)
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()[:16]
