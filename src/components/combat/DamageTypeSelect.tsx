import { DAMAGE_TYPES } from '../../lib/damage-types';

export function DamageTypeSelect({
  value,
  onChange,
  id,
  className,
}: {
  value: string;
  onChange: (type: string) => void;
  id?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      className={`field shrink-0 py-0.5 text-xs capitalize ${className ?? 'w-[7.25rem]'}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Damage type"
      title="Resistance, immunity, and vulnerability"
    >
      <option value="">untyped</option>
      {DAMAGE_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
