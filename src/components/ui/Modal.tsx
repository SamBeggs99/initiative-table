import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { CornerVine } from '../ornament/Botanical';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Keyboard-tight overlay: Esc closes, Tab cycles inside, focus returns to the
 * opener on unmount. Backdrop click cancels.
 */
export function Modal({
  title,
  children,
  footer,
  onClose,
  size = 'md',
  variant = 'default',
  initialFocusRef,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  /** 'glass' gives the panel a frosted, translucent liquid-glass surface. */
  variant?: 'default' | 'glass';
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target =
      initialFocusRef?.current ??
      (panel?.querySelector(FOCUSABLE) as HTMLElement | null);
    target?.focus();

    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [initialFocusRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = [
      ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const width =
    size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-auto p-4 ${
        variant === 'glass'
          ? 'bg-black/45 backdrop-blur-[2px]'
          : 'bg-black/70 backdrop-blur-sm'
      }`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`my-8 w-full ${width} outline-none ${
          variant === 'glass' ? 'modal-glass' : 'card shadow-2xl'
        }`}
        onKeyDown={onKeyDown}
      >
        <div className="header-vine flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id={titleId} className="sheet-title text-xl leading-tight">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            Esc
          </button>
        </div>
        <div className="px-4 py-3">{children}</div>
        {footer && (
          <div className="relative flex flex-wrap items-center justify-end gap-2 overflow-hidden border-t border-border px-4 py-3">
            <CornerVine
              corner="bottom-left"
              size={54}
              className="ornament-soft"
            />
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
