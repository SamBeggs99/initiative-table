import { useStore } from '../store';

/** Persistent chip showing the top of the undo stack — table insurance. */
export function UndoBar() {
  const stack = useStore((s) => s.undoStack);
  const undoLast = useStore((s) => s.undoLast);
  const shared = useStore((s) => s.settings.sharedScreen);

  if (shared || stack.length === 0) return null;

  const top = stack[stack.length - 1]!;
  const verb =
    top.kind === 'damage' ? 'damage' : top.kind === 'heal' ? 'heal' : 'temp HP';

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="pointer-events-auto toast-in card flex items-center gap-3 border-accent/30 px-3 py-2 text-sm shadow-xl">
        <span className="text-muted">
          Undo {verb} on <span className="font-medium text-text">{top.name}</span>
          {stack.length > 1 ? (
            <span className="text-muted"> · {stack.length} deep</span>
          ) : null}
        </span>
        <button type="button" className="btn btn-sm btn-accent" onClick={undoLast}>
          Undo
          <kbd className="chip ml-1 font-mono-stats text-[10px]">Ctrl+Z</kbd>
        </button>
      </div>
    </div>
  );
}
