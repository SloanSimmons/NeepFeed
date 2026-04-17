import { forwardRef, useEffect, useRef, useState } from 'react';
import MediaRenderer from './MediaRenderer.jsx';
import { api } from '../api/client.js';
import { timeAgo, formatScore, domainOf } from '../utils/formatTime.js';
import { IconUp, IconComment, IconExternal, IconBookmark, IconHide } from './icons.jsx';

/**
 * PostCard — one feed item. Focusable for keyboard-nav (class `post-card`,
 * data-reddit-id attribute).
 *
 * Props:
 *   post              — the post object from /api/feed
 *   dimSeen           — apply opacity when post.seen is true
 *   autoplayVideos    — forwarded to VideoPlayer
 *   defaultMuted      — forwarded to VideoPlayer
 *   onSeen(id)        — called when the card has dwelled in the viewport
 *   onMuteRegister    — (id, toggleFn) — VideoPlayer registers here so 'm' works
 *   onBookmarked(id, bool)
 *   onHidden(id)
 */
const PostCard = forwardRef(function PostCard(
  {
    post,
    dimSeen = true,
    autoplayVideos = true,
    defaultMuted = true,
    onSeen,
    onMuteRegister,
    onBookmarked,
    onHidden,
  },
  ref,
) {
  const cardRef = useRef(null);
  const [bookmarked, setBookmarked] = useState(!!post.bookmarked);

  // Dwell-tracking visibility
  useEffect(() => {
    if (!cardRef.current || !onSeen) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => onSeen?.(post.reddit_id, e.isIntersecting && e.intersectionRatio > 0.4));
      },
      { threshold: [0, 0.4, 1] },
    );
    io.observe(cardRef.current);
    return () => io.disconnect();
  }, [post.reddit_id, onSeen]);

  const bookmark = async () => {
    const next = !bookmarked;
    setBookmarked(next);
    try {
      await api.toggleBookmark(post.reddit_id, next);
      onBookmarked?.(post.reddit_id, next);
    } catch {
      setBookmarked(!next); // rollback
    }
  };

  const hide = async () => {
    try {
      await api.hidePost(post.reddit_id);
      onHidden?.(post.reddit_id);
    } catch {}
  };

  const commentsUrl = `https://reddit.com${post.permalink}`;
  const linkUrl = post.url || commentsUrl;

  return (
    <article
      ref={(n) => {
        cardRef.current = n;
        if (ref) { if (typeof ref === 'function') ref(n); else ref.current = n; }
      }}
      data-reddit-id={post.reddit_id}
      tabIndex={-1}
      className={[
        'post-card card p-4 sm:p-5 focus:outline-none focus:ring-2 focus:ring-brand/50',
        'transition-opacity',
        dimSeen && post.seen ? 'opacity-60' : '',
      ].join(' ')}
    >
      {/* Meta row */}
      <header className="flex items-center gap-2 text-xs text-fg-muted mb-2 flex-wrap">
        <span className="font-medium text-fg">r/{post.subreddit}</span>
        {post.link_flair && (
          <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] uppercase tracking-wide">
            {post.link_flair}
          </span>
        )}
        <span>·</span>
        <span>{timeAgo(post.created_utc)}</span>
        {post.author && (
          <>
            <span>·</span>
            <span>u/{post.author}</span>
          </>
        )}
        {post.is_nsfw && (
          <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold">NSFW</span>
        )}
        {post.crossposts?.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-fg-muted text-[10px]">
            also in {post.crossposts.slice(0, 3).map((x) => `r/${x.subreddit}`).join(', ')}
            {post.crossposts.length > 3 ? ` +${post.crossposts.length - 3}` : ''}
          </span>
        )}
        {typeof post.calculated_score === 'number' && (
          <span className="ml-auto font-mono text-[10px] text-fg-dim">
            {post.calculated_score.toFixed(0)}
          </span>
        )}
      </header>

      {/* Title */}
      <h2 className="text-lg sm:text-xl font-semibold leading-tight mb-3">
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand transition-colors"
        >
          {post.title}
        </a>
        {post.post_hint !== 'self' && domainOf(post.url) && domainOf(post.url) !== 'reddit.com' && (
          <span className="ml-2 text-xs text-fg-dim font-normal">({domainOf(post.url)})</span>
        )}
      </h2>

      {/* Selftext preview */}
      {post.selftext_preview && (
        <p className="text-sm text-fg-muted mb-3 line-clamp-3 whitespace-pre-wrap">
          {post.selftext_preview}
        </p>
      )}

      {/* Media */}
      <MediaRenderer
        post={post}
        autoplayVideos={autoplayVideos}
        defaultMuted={defaultMuted}
        onMuteRegister={onMuteRegister}
      />

      {/* Score bar */}
      <footer className="flex items-center gap-3 mt-3 text-sm text-fg-muted flex-wrap">
        <span className="inline-flex items-center gap-1">
          <IconUp className="w-4 h-4" />
          <span className="font-medium text-fg">{formatScore(post.score)}</span>
          <span className="text-xs">({Math.round((post.upvote_ratio || 0) * 100)}%)</span>
        </span>
        <a
          href={commentsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-fg transition-colors"
        >
          <IconComment className="w-4 h-4" />
          <span>{formatScore(post.num_comments)}</span>
        </a>

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={bookmark}
            title="Bookmark (b)"
            className={`p-1.5 rounded hover:bg-white/5 ${bookmarked ? 'text-brand' : ''}`}
            aria-pressed={bookmarked}
          >
            <IconBookmark className="w-4 h-4" filled={bookmarked} />
          </button>
          <button
            onClick={hide}
            title="Hide (h)"
            className="p-1.5 rounded hover:bg-white/5"
          >
            <IconHide className="w-4 h-4" />
          </button>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open (o)"
            className="p-1.5 rounded hover:bg-white/5"
          >
            <IconExternal className="w-4 h-4" />
          </a>
        </div>
      </footer>
    </article>
  );
});

export default PostCard;
