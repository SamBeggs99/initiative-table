import { useRef, useState } from 'react';
import { readPortraitFile } from '../../lib/portrait';

export function PortraitThumb({
  src,
  alt,
  size = 'sm',
  className = '',
}: {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  if (!src) return null;
  const dim =
    size === 'xs'
      ? 'h-6 w-6'
      : size === 'sm'
        ? 'h-8 w-8'
        : size === 'md'
          ? 'h-12 w-12'
          : 'h-16 w-16';
  return (
    <img
      src={src}
      alt={alt}
      className={`portrait-thumb ${dim} ${className}`}
      draggable={false}
    />
  );
}

/**
 * Compact upload / clear control for creature, PC, and NPC portraits.
 * Calls `onChange` with a resized data URL, or `undefined` when cleared.
 */
export function PortraitField({
  value,
  onChange,
  label = 'Portrait',
  size = 'md',
}: {
  value?: string;
  onChange: (next: string | undefined) => void;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await readPortraitFile(file);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange(result.dataUrl);
  };

  return (
    <div className="space-y-1.5">
      <span className="block text-xs text-muted">{label}</span>
      <div className="flex items-center gap-3">
        <div
          className={`portrait-frame flex shrink-0 items-center justify-center overflow-hidden ${
            size === 'sm' ? 'h-12 w-12' : size === 'lg' ? 'h-20 w-20' : 'h-16 w-16'
          }`}
        >
          {value ? (
            <img
              src={value}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <span className="text-[10px] text-muted">None</span>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void pick(file);
            }}
          />
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Working…' : value ? 'Replace' : 'Upload'}
          </button>
          {value && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={busy}
              onClick={() => {
                setError(null);
                onChange(undefined);
              }}
            >
              Remove
            </button>
          )}
          <span className="w-full text-[10px] text-muted">
            JPEG / PNG / WebP · resized to ~256px
          </span>
        </div>
      </div>
      {error && <p className="text-[11px] text-damage">{error}</p>}
    </div>
  );
}
