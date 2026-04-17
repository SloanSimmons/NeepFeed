import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { IconMute, IconPlay, IconUnmute } from './icons.jsx';

/**
 * VideoPlayer: <video> autoplay muted via IntersectionObserver.
 * - Plays when >=60% in view, pauses when leaves.
 * - Click to toggle mute.
 * - On error, calls /api/posts/:id/refresh-video once and retries.
 * - Falls back to thumbnail + "Watch on Reddit" link if refresh fails.
 */
export default function VideoPlayer({ post, autoplay = true, defaultMuted = true, onMuteRegister }) {
  const videoRef = useRef(null);
  const [src, setSrc] = useState(post.video_url);
  const [muted, setMuted] = useState(defaultMuted);
  const [failed, setFailed] = useState(false);
  const triedRefreshRef = useRef(false);

  // Expose toggle mute to parent (for 'm' keyboard shortcut)
  useEffect(() => {
    if (onMuteRegister) onMuteRegister(post.reddit_id, () => setMuted((m) => !m));
    return () => { if (onMuteRegister) onMuteRegister(post.reddit_id, null); };
  }, [post.reddit_id, onMuteRegister]);

  useEffect(() => {
    if (!autoplay || !videoRef.current || !src) return;
    const v = videoRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            v.play().catch(() => {});
          } else {
            v.pause();
          }
        });
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [autoplay, src]);

  const onError = async () => {
    if (triedRefreshRef.current) {
      setFailed(true);
      return;
    }
    triedRefreshRef.current = true;
    try {
      const r = await api.refreshVideo(post.reddit_id);
      if (r.video_url) {
        setSrc(r.video_url);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
  };

  if (failed || !src) {
    return (
      <div className="relative aspect-video bg-black/40 rounded-xl overflow-hidden flex items-center justify-center">
        {post.thumbnail ? (
          <img src={post.thumbnail} alt="" className="w-full h-full object-cover opacity-60" />
        ) : null}
        <a
          href={`https://reddit.com${post.permalink}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex items-center justify-center text-fg font-medium bg-black/50 hover:bg-black/70 transition"
        >
          <IconPlay className="w-6 h-6 mr-2" />
          Watch on Reddit
        </a>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={src}
        poster={post.thumbnail || undefined}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onError={onError}
        onClick={() => setMuted((m) => !m)}
        className="w-full max-h-[560px] bg-black cursor-pointer"
      />
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 rounded-full p-2 text-white"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <IconMute className="w-4 h-4" /> : <IconUnmute className="w-4 h-4" />}
      </button>
    </div>
  );
}
