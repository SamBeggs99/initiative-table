import { lootKindLabel, pendingLoot } from '../../lib/loot';
import { selectActiveCombat, useStore } from '../../store';
import { VineRule } from '../ornament/Botanical';

/** Live-fight loot reminder — award lines as the party loots the room. */
export function CombatLootPanel({ sharedScreen }: { sharedScreen?: boolean }) {
  const combat = useStore(selectActiveCombat);
  const awardLoot = useStore((s) => s.awardLoot);
  const awardAllLoot = useStore((s) => s.awardAllLoot);
  const clearAwardedLoot = useStore((s) => s.clearAwardedLoot);

  const loot = combat.loot ?? [];
  if (sharedScreen || loot.length === 0) return null;

  const pending = pendingLoot(loot);
  const awardedCount = loot.filter((l) => l.awarded && l.text.trim()).length;
  const ordered = [...loot].sort((a, b) => {
    if (!!b.boss !== !!a.boss) return a.boss ? -1 : 1;
    if (!!a.awarded !== !!b.awarded) return a.awarded ? 1 : -1;
    return 0;
  });

  return (
    <section className="shrink-0 border-b border-border px-3 py-2">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title section-title-leaf">Loot</h2>
          <p className="text-[11px] text-muted">
            {combat.sourceEncounterName
              ? `From “${combat.sourceEncounterName}”`
              : 'Award after the fight so it lands in Notes'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {awardedCount > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              title="Already in Notes — remove from this canvas"
              onClick={() => clearAwardedLoot()}
            >
              Clear awarded
            </button>
          )}
          {pending.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-accent"
              onClick={() => awardAllLoot()}
            >
              Award all ({pending.length})
            </button>
          )}
        </div>
      </div>
      <VineRule className="mb-2" />
      <ul className="space-y-1 text-xs">
        {ordered.map((line) => (
          <li
            key={line.id}
            className={`flex items-start gap-2 rounded border px-2 py-1.5 ${
              line.awarded
                ? 'border-border/50 text-muted line-through'
                : line.boss
                  ? 'border-amber/40 bg-amber/5 text-text'
                  : 'border-border/70 text-text'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {line.boss && (
                  <span className="badge-soft badge-accent text-[10px]">Boss</span>
                )}
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  {lootKindLabel(line.kind)}
                </span>
              </div>
              <div className="mt-0.5 font-medium leading-snug">{line.text}</div>
            </div>
            {!line.awarded && (
              <button
                type="button"
                className="btn btn-sm shrink-0"
                onClick={() => awardLoot(line.id)}
              >
                Award
              </button>
            )}
            {line.awarded && (
              <span className="shrink-0 pt-0.5 text-[10px] text-heal">Awarded</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
