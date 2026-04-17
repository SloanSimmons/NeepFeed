import { useEffect, useRef } from 'react';

/**
 * Global keyboard navigation.
 *
 * j / ↓   next post
 * k / ↑   prev post
 * o       open focused post's URL in new tab
 * c       open focused post's Reddit comments in new tab
 * m       toggle mute on focused video
 * b       bookmark/unbookmark focused post
 * h       hide focused post
 * /       focus search (if onFocusSearch provided)
 * Esc     clear focus / close modal
 * ?       show shortcuts modal (onShowHelp)
 *
 * Ignored when target is an input/textarea or a contentEditable element.
 *
 * Calls the provided action callbacks with the `data-reddit-id` attribute of
 * the currently focused PostCard (elements with class `.post-card`).
 */
export function useKeyboardNav(actions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const getCards = () => Array.from(document.querySelectorAll('.post-card'));
    const currentIdx = () => {
      const cards = getCards();
      const active = document.activeElement;
      if (active?.classList?.contains('post-card')) {
        return cards.indexOf(active);
      }
      // Find the one closest to the top of the viewport
      let best = 0;
      let bestDist = Infinity;
      cards.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const d = Math.abs(r.top - 120); // below sticky header
        if (r.bottom > 0 && d < bestDist) { bestDist = d; best = i; }
      });
      return best;
    };

    const focus = (idx) => {
      const cards = getCards();
      if (cards.length === 0) return;
      const next = cards[Math.max(0, Math.min(cards.length - 1, idx))];
      next.setAttribute('tabindex', '-1');
      next.focus({ preventScroll: false });
      next.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // If near end, signal to load more
      if (idx >= cards.length - 3) actionsRef.current?.onNearEnd?.();
    };

    const focusedId = () => {
      const active = document.activeElement;
      return active?.getAttribute?.('data-reddit-id') || null;
    };

    const onKey = (e) => {
      // Skip when typing
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          focus(currentIdx() + 1);
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          focus(currentIdx() - 1);
          break;
        case 'o':
          e.preventDefault();
          actionsRef.current?.onOpen?.(focusedId());
          break;
        case 'c':
          e.preventDefault();
          actionsRef.current?.onOpenComments?.(focusedId());
          break;
        case 'm':
          e.preventDefault();
          actionsRef.current?.onMute?.(focusedId());
          break;
        case 'b':
          e.preventDefault();
          actionsRef.current?.onBookmark?.(focusedId());
          break;
        case 'h':
          e.preventDefault();
          actionsRef.current?.onHide?.(focusedId());
          break;
        case '/':
          e.preventDefault();
          actionsRef.current?.onFocusSearch?.();
          break;
        case 'Escape':
          actionsRef.current?.onEscape?.();
          break;
        case '?':
          e.preventDefault();
          actionsRef.current?.onShowHelp?.();
          break;
        default:
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
