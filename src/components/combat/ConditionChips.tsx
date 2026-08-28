import type { ActiveCondition } from '../../types';

export function ConditionChips({
  conditions,
  onRemove,
  onAdd,
  addButtonClassName = '',
}: {
  conditions: ActiveCondition[];
  onRemove: (name: string) => void;
  onAdd: () => void;
  addButtonClassName?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {conditions.map((c) => (
        <button
          key={`${c.name}-${c.value ?? ''}-${c.endsOnRound ?? ''}`}
          type="button"
          className="badge-condition rounded px-1.5 py-0.5 text-[10px]"
          title="Click to remove"
          onClick={() => onRemove(c.name)}
        >
          {c.name}
          {c.value != null ? ` ${c.value}` : ''}
        </button>
      ))}
      <button
        type="button"
        className={`btn btn-sm ${addButtonClassName}`.trim()}
        onClick={onAdd}
      >
        +cond
      </button>
    </div>
  );
}
