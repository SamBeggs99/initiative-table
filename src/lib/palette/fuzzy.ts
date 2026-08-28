/** Lightweight fuzzy score — higher is better; 0 = no match. */
export function fuzzyScore(query: string, candidate: string): number {
  const q = query.trim().toLowerCase();
  const c = candidate.toLowerCase();
  if (!q) return 0;
  if (c === q) return 1000;
  if (c.startsWith(q)) return 800 + Math.min(q.length, 50);
  if (c.includes(q)) return 500 + Math.min(q.length, 50);

  // Subsequence match (f z y style)
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < c.length && qi < q.length; i++) {
    if (c[i] === q[qi]) {
      qi += 1;
      streak += 1;
      score += 10 + streak * 2;
    } else {
      streak = 0;
    }
  }
  if (qi < q.length) return 0;
  return score;
}

export function fuzzyPick<T>(
  query: string,
  items: T[],
  getName: (item: T) => string,
  limit = 8,
): { item: T; score: number; name: string }[] {
  return items
    .map((item) => {
      const name = getName(item);
      return { item, name, score: fuzzyScore(query, name) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
