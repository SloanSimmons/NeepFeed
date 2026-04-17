import { useState } from 'react';
import VideoPlayer from './VideoPlayer.jsx';
import GalleryViewer from './GalleryViewer.jsx';

/**
 * Selects the right media view for a post.
 * Desktop hover-preview on thumbnails will be added via the hoverPreview prop.
 */
export default function MediaRenderer({ post, autoplayVideos, defaultMuted, onMuteRegister }) {
  const [loaded, setLoaded] = useState(false);

  if (post.is_video || post.post_hint === 'hosted:video' || post.post_hint === 'rich:video') {
    return (
      <VideoPlayer
        post={post}
        autoplay={autoplayVideos}
        defaultMuted={defaultMuted}
        onMuteRegister={onMuteRegister}
      />
    );
  }

  if (post.post_hint === 'gallery' && post.gallery_urls?.length) {
    return <GalleryViewer urls={post.gallery_urls} />;
  }

  if (post.post_hint === 'image') {
    return (
      <a href={post.url} target="_blank" rel="noopener noreferrer" className="block">
        <div className={`relative rounded-xl overflow-hidden bg-bg-elev ${loaded ? '' : 'animate-pulse'}`}>
          <img
            src={post.url}
            alt=""
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className="w-full max-h-[560px] object-contain bg-black"
          />
        </div>
      </a>
    );
  }

  // Link or self: show thumbnail if available, else nothing (selftext renders separately)
  if (post.thumbnail && post.post_hint !== 'self') {
    return (
      <a href={post.url} target="_blank" rel="noopener noreferrer" className="block">
        <div className="relative rounded-xl overflow-hidden bg-bg-elev flex">
          <img
            src={post.thumbnail}
            alt=""
            loading="lazy"
            className="w-full max-h-[400px] object-cover"
          />
        </div>
      </a>
    );
  }

  return null;
}
