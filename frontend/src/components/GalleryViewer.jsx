import { useState } from 'react';
import { IconChevron, IconGallery } from './icons.jsx';

/** Swipe/click gallery for Reddit multi-image posts. */
export default function GalleryViewer({ urls, className = '' }) {
  const [idx, setIdx] = useState(0);
  if (!urls?.length) return null;

  const go = (delta) => setIdx((i) => Math.max(0, Math.min(urls.length - 1, i + delta)));

  const onTouchStart = (e) => {
    e.currentTarget._startX = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - (e.currentTarget._startX || 0);
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-black ${className}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img
        src={urls[idx]}
        alt=""
        loading="lazy"
        className="w-full max-h-[560px] object-contain bg-black"
      />
      {urls.length > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            disabled={idx === 0}
            aria-label="Previous image"
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 disabled:opacity-30 rounded-full p-2"
          >
            <IconChevron className="w-4 h-4 rotate-90 text-white" />
          </button>
          <button
            onClick={() => go(1)}
            disabled={idx === urls.length - 1}
            aria-label="Next image"
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 disabled:opacity-30 rounded-full p-2"
          >
            <IconChevron className="w-4 h-4 -rotate-90 text-white" />
          </button>
          <div className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 text-xs text-white flex items-center gap-1">
            <IconGallery className="w-3 h-3" />
            {idx + 1} / {urls.length}
          </div>
        </>
      )}
    </div>
  );
}
