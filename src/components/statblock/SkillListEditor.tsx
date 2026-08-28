import { useEffect, useState } from 'react';
import { formatModifier } from '../../lib/statblock-derived';
import {
  canonicalSkillName,
  skillCatalog,
  skillEntries,
  skillsFromRows,
} from '../../lib/statblock-skills';
import type { System } from '../../types';

export function SkillListEditor({
  system,
  skills,
  onChange,
}: {
  system: System;
  skills: Record<string, number>;
  onChange: (skills: Record<string, number>) => void;
}) {
  const [rows, setRows] = useState(() => skillEntries(skills, system));
  const [custom, setCustom] = useState('');

  useEffect(() => {
    setRows(skillEntries(skills, system));
  }, [skills, system]);

  const catalog = skillCatalog(system);
  const used = new Set(rows.map((r) => r.name.trim().toLowerCase()).filter(Boolean));
  const unused = catalog.filter((s) => !used.has(s.toLowerCase()));

  const emit = (next: { name: string; bonus: number }[]) => {
    setRows(next);
    onChange(skillsFromRows(next, system));
  };

  const add = (name: string, bonus = 0) => {
    const canonical = canonicalSkillName(name, system);
    if (!canonical || used.has(canonical.toLowerCase())) return;
    emit([...rows, { name: canonical, bonus }]);
  };

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
        Skills
      </h3>
      <p className="text-[11px] leading-snug text-muted">
        Only list skills with a bonus. The plus is the number on the sheet
        (Stealth +7).
      </p>
      {rows.length === 0 && <p className="text-xs text-muted">None yet.</p>}
      <ul className="space-y-1">
        {rows.map((row, index) => (
          <li key={`skill-${index}`} className="flex items-center gap-1.5">
            <input
              className="min-w-0 flex-1 rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
              value={row.name}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r, i) =>
                    i === index ? { ...r, name: e.target.value } : r,
                  ),
                )
              }
              onBlur={(e) =>
                emit(
                  rows.map((r, i) =>
                    i === index ? { ...r, name: e.target.value } : r,
                  ),
                )
              }
              aria-label="Skill name"
            />
            <span className="font-mono-stats w-8 shrink-0 text-right text-xs tabular-nums text-muted">
              {formatModifier(row.bonus)}
            </span>
            <input
              type="number"
              className="field w-16 py-1 font-mono-stats text-sm tabular-nums"
              value={row.bonus}
              onChange={(e) => {
                const bonus = Number(e.target.value) || 0;
                emit(rows.map((r, i) => (i === index ? { ...r, bonus } : r)));
              }}
              aria-label={`${row.name || 'Skill'} bonus`}
            />
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => emit(rows.filter((_, i) => i !== index))}
              aria-label={`Remove ${row.name || 'skill'}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        {unused.length > 0 && (
          <select
            className="field min-w-[10rem] flex-1 py-1 text-xs"
            value=""
            onChange={(e) => {
              const name = e.target.value;
              if (name) add(name);
            }}
            aria-label="Add a listed skill"
          >
            <option value="">Add skill…</option>
            {unused.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <input
          className="field min-w-[8rem] flex-1 py-1 text-xs"
          placeholder="Custom skill"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            add(custom);
            setCustom('');
          }}
        />
        <button
          type="button"
          className="btn btn-sm"
          disabled={!custom.trim()}
          onClick={() => {
            add(custom);
            setCustom('');
          }}
        >
          Add
        </button>
      </div>
    </section>
  );
}
