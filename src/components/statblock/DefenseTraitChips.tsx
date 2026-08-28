import type { CSSProperties } from 'react';
import { damageTypeFlashColor, isDamageType } from '../../lib/damage-types';
import {
  formatDefenseTokenLabel,
  parseDefenseTraits,
  type DefenseGroup,
} from '../../lib/defense-traits';

export type DefenseKind = 'resist' | 'immune' | 'vulnerable' | 'condition';

function chipColor(name: string, kind: DefenseKind): string {
  if (kind === 'condition') return 'var(--color-condition)';
  const head = name.trim().toLowerCase().split(/\s+/)[0] ?? '';
  if (head === 'physical') return 'var(--color-muted)';
  if (isDamageType(head)) return damageTypeFlashColor(head);
  if (kind === 'vulnerable') return 'var(--color-amber)';
  if (kind === 'immune') return 'var(--color-damage)';
  return 'var(--color-muted)';
}

function Groups({ groups, kind }: { groups: DefenseGroup[]; kind: DefenseKind }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      {groups.map((group, gi) => (
        <span
          key={`${group.qualifier ?? 'g'}-${gi}`}
          className="inline-flex max-w-full flex-wrap items-center gap-1"
        >
          {group.tokens.map((token) => (
            <span
              key={`${token.name}-${group.qualifier ?? ''}`}
              className={`defense-chip defense-chip-${kind}`}
              style={{ '--defense': chipColor(token.name, kind) } as CSSProperties}
            >
              <span className="defense-chip-dot" aria-hidden />
              <span>{formatDefenseTokenLabel(token.name)}</span>
            </span>
          ))}
          {group.qualifier && (
            <span className="defense-chip-note">{group.qualifier}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function DefenseTraitChips({
  value,
  kind,
}: {
  value?: string;
  kind: DefenseKind;
}) {
  const groups = parseDefenseTraits(value);
  if (groups.length === 0) return null;
  return <Groups groups={groups} kind={kind} />;
}

export function DefenseTraitRow({
  label,
  value,
  kind,
}: {
  label: string;
  value?: string;
  kind: DefenseKind;
}) {
  const groups = parseDefenseTraits(value);
  if (groups.length === 0) return null;
  return (
    <div className="my-1 flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
      <span className="shrink-0 pt-0.5 text-muted">{label}</span>
      <Groups groups={groups} kind={kind} />
    </div>
  );
}
