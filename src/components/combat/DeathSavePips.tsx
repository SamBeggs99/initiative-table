/**
 * Death saves as three-and-three marks rather than `●●○` glyph strings.
 *
 * The character counter was information-complete and unreadable at a glance:
 * two runs of near-identical circles differing only in colour, in a monospace
 * face, on the row of a character who is dying. This is the state that most
 * needs to be legible from across the table.
 *
 * Successes fill left-to-right in the heal colour, failures in the damage
 * colour, and the third failure is drawn heavier because it is the one that
 * ends the character.
 */
export function DeathSavePips({
  successes,
  failures,
}: {
  successes: number;
  failures: number;
}) {
  const stable = successes >= 3;
  const dead = failures >= 3;

  return (
    <div className="flex items-center gap-2">
      <span className="sr-only">
        {dead
          ? 'Dead: three failed death saves'
          : stable
            ? 'Stable: three successful death saves'
            : `Death saves: ${successes} of 3 succeeded, ${failures} of 3 failed`}
      </span>

      <span className="death-pips" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={`s${i}`}
            className={`death-pip death-pip-save ${i < successes ? 'is-on' : ''}`}
          />
        ))}
      </span>

      <span className="death-pips-divider" aria-hidden />

      <span className="death-pips" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={`f${i}`}
            className={`death-pip death-pip-fail ${i < failures ? 'is-on' : ''} ${
              i === 2 ? 'death-pip-final' : ''
            }`}
          />
        ))}
      </span>

      {(stable || dead) && (
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${
            dead ? 'text-damage' : 'text-heal'
          }`}
        >
          {dead ? 'Dead' : 'Stable'}
        </span>
      )}
    </div>
  );
}
