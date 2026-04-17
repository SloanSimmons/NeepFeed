import { IconUp } from './icons.jsx';

export default function FreshBatchBanner({ count, onClick }) {
  if (!count) return null;
  return (
    <button
      onClick={onClick}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-30 bg-brand text-black font-semibold
                 px-4 py-2 rounded-full shadow-lg shadow-black/50 hover:bg-brand-hover
                 flex items-center gap-2 text-sm transition-all animate-bounce"
      style={{ animationIterationCount: 3 }}
    >
      <IconUp className="w-4 h-4" />
      {count} new {count === 1 ? 'post' : 'posts'}
    </button>
  );
}
