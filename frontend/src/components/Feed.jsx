import { useCallback, useEffect, useRef } from 'react';
import PostCard from './PostCard.jsx';

/**
 * Feed: renders a list of PostCards with IntersectionObserver-based
 * infinite scroll (a sentinel at the bottom triggers loadMore when visible).
 */
export default function Feed({
  posts,
  loading,
  hasMore,
  loadMore,
  settings,
  onPostSeen,
  onMuteRegister,
  onBookmarked,
  onHidden,
  error,
  onRetry,
}) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !loading && hasMore) {
            loadMore();
          }
        });
      },
      { rootMargin: '800px 0px' }, // start loading before user hits the bottom
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loading, hasMore, loadMore]);

  if (error && posts.length === 0) {
    return (
      <div className="card p-6 text-center">
        <div className="text-sm font-semibold mb-2">Couldn't load the feed.</div>
        <div className="text-xs text-fg-muted mb-4 font-mono whitespace-pre-wrap">
          {String(error?.message || error)}
        </div>
        {onRetry && (
          <button onClick={onRetry} className="btn-primary text-sm">Retry</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((p) => (
        <PostCard
          key={p.reddit_id}
          post={p}
          dimSeen={settings?.dim_seen !== false}
          autoplayVideos={settings?.autoplay_videos !== false}
          defaultMuted={settings?.default_video_muted !== false}
          onSeen={onPostSeen}
          onMuteRegister={onMuteRegister}
          onBookmarked={onBookmarked}
          onHidden={onHidden}
        />
      ))}

      {hasMore && (
        <div ref={sentinelRef} className="py-10 text-center text-fg-dim text-sm">
          {loading ? 'Loading more…' : ' '}
        </div>
      )}
      {!hasMore && posts.length > 0 && (
        <div className="py-10 text-center text-fg-dim text-sm">— end of feed —</div>
      )}
    </div>
  );
}
