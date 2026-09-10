import { useRef, useState } from 'react';
import { readPortraitBlob } from '../../lib/portrait';
import { putPortrait } from '../../lib/portrait-store';
import { usePortraitUrl } from './usePortraitUrl';

export function PortraitThumb({
  src,
  portraitId,
  alt,
  size = 'sm',
  className = '',
}: {
  /** Legacy data URL. Used only when there is no `portraitId`. */
  src?: string | null;
  /** Id in the portrait store — the current way portraits are referenced. */
  portraitId?: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const url = usePortraitUrl(portraitId, src);
  if (!url) return null;
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
      src={url}
      alt={alt}
      className={`portrait-thumb ${dim} ${className}`}
      draggable={false}
    />
  );
}

/**
 * Compact upload / clear control for creature, PC, and NPC portraits.
 *
 * Writes the image into the portrait store and calls `onChange` with its id,
 * so the sheet carries a ~40-character string instead of ~160 kB of base64.
 */
export function PortraitField({
  value,
  portraitId,
  onChange,
  label = 'Portrait',
  size = 'md',
}: {
  /** Legacy data URL on an un-migrated record; shown when there is no id. */
  value?: string;
  portraitId?: string;
  onChange: (nextId: string | undefined) => void;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = usePortraitUrl(portraitId, value);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await readPortraitBlob(file);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChange(await putPortrait(result.blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save portrait.');
    } finally {
      setBusy(false);
    }
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
          {url ? (
            <img
              src={url}
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
            {busy ? 'Working…' : url ? 'Replace' : 'Upload'}
          </button>
          {url && (
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
