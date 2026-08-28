/** Format a saved-encounter creature row when the id no longer resolves. */
export function unresolvedCreatureLabel(nameSnapshot: string): string {
  return `${nameSnapshot} — no longer in bestiary`;
}
