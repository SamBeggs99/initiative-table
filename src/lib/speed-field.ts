/**
 * Homebrew speed field: `walk=30,fly=60` or a JSON object.
 * Parsing is lossy while the user is mid-token (`walk=30,fl`), so the editor
 * must keep the raw string — never derive the input value from the parsed map.
 */

export function formatSpeedField(
  speed: Record<string, number | string> | undefined,
): string {
  return Object.entries(speed ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
}

/**
 * Returns a speed map, or null when the text is incomplete JSON (do not wipe
 * the previous map while the user is still typing `{`).
 */
export function parseSpeedField(
  raw: string,
): Record<string, number | string> | null {
  const t = raw.trim();
  if (!t) return {};
  if (t.startsWith('{')) {
    try {
      const parsed = JSON.parse(t) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      const speed: Record<string, number | string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const key = k.trim();
        if (!key) continue;
        if (typeof v === 'number' && Number.isFinite(v)) speed[key] = v;
        else if (typeof v === 'string') speed[key] = v;
        else if (typeof v === 'number') continue;
        else speed[key] = String(v);
      }
      return speed;
    } catch {
      return null;
    }
  }

  const speed: Record<string, number | string> = {};
  for (const part of t.split(',')) {
    const piece = part.trim();
    if (!piece) continue;
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    const k = piece.slice(0, eq).trim();
    const v = piece.slice(eq + 1).trim();
    if (!k) continue;
    const num = Number(v);
    speed[k] = Number.isFinite(num) && v !== '' ? num : v;
  }
  return speed;
}
