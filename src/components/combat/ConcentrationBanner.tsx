import { useStore } from '../../store';

export function ConcentrationBanner() {
  const prompt = useStore((s) => s.concentrationPrompt);
  const roll = useStore((s) => s.rollConcentrationSave);
  const drop = useStore((s) => s.dropConcentration);
  const clear = useStore((s) => s.clearConcentrationPrompt);

  if (!prompt) return null;

  return (
    <div
      className="border-b border-condition/40 bg-condition/10 px-3 py-2 text-sm"
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-condition">
          Concentration — {prompt.name} DC {prompt.dc}
        </span>
        <span className="text-xs text-muted">({prompt.damage} damage)</span>
        <button
          type="button"
          className="btn btn-sm btn-on"
          onClick={roll}
        >
          Roll Con save
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={drop}
        >
          Drop
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={clear}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
