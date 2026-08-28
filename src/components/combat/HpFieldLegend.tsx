import { HP_FIELD_LEGEND } from '../../lib/combat';

export function HpFieldLegend() {
  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        Combat HP field
      </h3>
      <ul className="space-y-1 text-sm">
        {HP_FIELD_LEGEND.map((row) => (
          <li key={row.keys} className="flex justify-between gap-4">
            <kbd className="chip font-mono-stats shrink-0">{row.keys}</kbd>
            <span className="text-right text-muted">{row.action}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
