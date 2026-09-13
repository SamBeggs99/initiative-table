import type { Combatant } from '../types';

/**
 * Where a combatant sits on the tape, as distinct from what it rolled.
 *
 * Initiative numbers produce the *first* order, but they are not the last word
 * on it. A DM readies an action and drops to the bottom of the round, a
 * summoned creature joins on the summoner's count, a player swaps places with
 * an ally — all of it is ordinary play, and none of it is expressible by
 * re-typing a d20 result. So the combatant array is authoritative and these
 * helpers keep the printed numbers honest about the order it describes.
 */

/** Move one item within a list. Returns the same array when nothing moves. */
export function moveInOrder<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(target, 0, item);
  return next;
}

/**
 * The initiative a hand-placed combatant should now carry, given the rows it
 * landed between. `null` neighbours mean the top or bottom of the tape.
 *
 * The rule is *don't lie and don't churn*: a number already consistent with
 * both neighbours is left exactly as it was, so dragging a 14 from between a
 * 20 and a 9 to between a 17 and a 12 does not renumber it for no reason. Only
 * a number that would read as out of order gets rewritten, and then to the
 * roomiest value available — the midpoint, whole where a whole number fits and
 * a half otherwise, so the slot stays draggable afterwards.
 *
 * Two neighbours on the same count leave nothing to sit between, so the tie is
 * matched and row order carries the placement. That placement survives
 * everything except an explicit Sort, which is the DM asking for the order to
 * be re-derived from the numbers.
 */
export function initiativeForSlot(
  above: number | null,
  below: number | null,
  current: number | null,
): number | null {
  if (above == null && below == null) return current;

  if (above == null) {
    return current != null && current >= below! ? current : below! + 1;
  }
  if (below == null) {
    return current != null && current <= above ? current : above - 1;
  }

  // A stretch that is not descending was itself hand-ordered. There is no
  // number to derive from, so leave the pill alone rather than invent one.
  if (above < below) return current;
  if (current != null && current <= above && current >= below) return current;

  if (above === below) return above;
  const mid = (above + below) / 2;
  const whole = Math.round(mid);
  return whole < above && whole > below ? whole : mid;
}

/**
 * Where a newcomer belongs on a tape that may already have been hand-ordered.
 *
 * Deliberately an insertion point rather than a re-sort: a DM who has arranged
 * a round should be able to drop a reinforcement into it without the other
 * twenty rows rearranging themselves underneath. Ties put the arrival last
 * among its equals, which is where a creature that just walked in belongs.
 */
export function initiativeInsertIndex(
  list: Pick<Combatant, 'initiative'>[],
  initiative: number | null,
): number {
  const value = initiative ?? -Infinity;
  for (let i = 0; i < list.length; i += 1) {
    const seated = list[i]!.initiative ?? -Infinity;
    if (seated < value) return i;
  }
  return list.length;
}
