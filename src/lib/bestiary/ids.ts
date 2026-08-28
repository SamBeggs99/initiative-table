import type { System } from '../../types';

/** Deterministic id for synced / bundled creatures. Homebrew must use random UUIDs. */
export function deterministicCreatureId(
  system: System,
  sourceSlug: string,
  slug: string,
): string {
  return `${system}:${sourceSlug}:${slug}`;
}

export function isDeterministicCreatureId(id: string): boolean {
  return id.includes(':') && !isUuid(id);
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export function newHomebrewId(): string {
  return crypto.randomUUID();
}

export function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'creature'
  );
}
