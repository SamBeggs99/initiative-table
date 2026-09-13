import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

/**
 * Numeric inputs that show what the number actually is.
 *
 * `<input type="number">` under React has a long-standing quirk: when the value
 * prop changes, react-dom decides whether to rewrite the DOM using **loose**
 * equality —
 *
 *     if (node.value != value) node.value = toString(value);
 *
 * `"01" == 1` is `true`, so React concludes the DOM already matches and leaves
 * it alone. Type a digit after a leading `0` and the field reads `01` forever,
 * even though state says `1`. The same trap catches `"1."`, `"+5"`, `"0.0"`
 * and `" 5"`; a default of `0` is simply the most common way to walk into it.
 *
 * So these keep the text the user is typing in local state, commit the parsed
 * number upward, and re-normalise the text on blur. React never has to
 * reconcile a number against a string, and the quirk cannot fire.
 *
 * Two things the raw inputs also got wrong, fixed here on the way:
 *
 * - **You can clear the field.** `Number('') || 0` snapped an emptied box
 *   straight back to `0`, so retyping meant select-all first. The box may sit
 *   empty while you type and only settles on blur.
 * - **You can type a negative.** `Number('-')` is `NaN`, which `|| 0` turned
 *   into `0` and re-rendered over the `-` you had just typed.
 */

/** Digits, at most one leading sign, at most one decimal point. */
const PARTIAL = /^[+-]?\d*\.?\d*$/;

/**
 * Drop a leading zero the moment a real digit lands behind it.
 *
 * These fields default to 0, so the overwhelmingly common action is 'replace
 * the 0 with a real number' — and waiting until blur to tidy it up is what the
 * original bug looked like from the user's side. '0' on its own and '0.5' are
 * left alone; there is no integer stat where a leading zero means anything.
 */
export function stripLeadingZeros(raw: string): string {
  return raw.replace(/^([+-]?)0+(?=\d)/, '$1');
}

/** '' and a lone sign are legal *while typing*. */
function parseNumeric(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

interface CoreOptions {
  text: string;
  setText: (s: string) => void;
  focused: React.MutableRefObject<boolean>;
  min?: number;
  max?: number;
}

function clampTo(n: number, min?: number, max?: number): number {
  let out = n;
  if (min != null) out = Math.max(min, out);
  if (max != null) out = Math.min(max, out);
  return out;
}

/**
 * Mid-typing clamp: ceiling only.
 *
 * Applying `min` on every keystroke fights the user building a number up. With
 * `min={1}`, typing the 0 of "10" snapped straight to 1 and the next keystroke
 * landed on the wrong value — the same class of bug this component exists to
 * kill. The floor is applied when the value settles instead. The ceiling is
 * safe to apply live, because digits are typed left to right and a number only
 * grows.
 */
function clampWhileTyping(n: number, max?: number): number {
  return max != null ? Math.min(max, n) : n;
}

type PassThrough = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'min' | 'max' | 'type'
>;

function useNumericText(display: string): CoreOptions {
  const [text, setText] = useState(display);
  const focused = useRef(false);
  useEffect(() => {
    // Follow the prop when the user is not the one driving it — an undo, a
    // rest, a sheet reload. Never while focused, or it fights their typing.
    if (!focused.current) setText(display);
  }, [display]);
  return { text, setText, focused };
}

/**
 * A required number. Empty settles back to 0 (or `min`) on blur.
 */
export function NumberField({
  value,
  onChange,
  onCommit,
  min,
  max,
  allowEmpty = false,
  ...rest
}: {
  value: number;
  onChange: (next: number) => void;
  /** Fires on blur / Enter with the settled value. */
  onCommit?: (next: number) => void;
  min?: number;
  max?: number;
  /** Render an empty box for 0 rather than "0" (optional bonuses). */
  allowEmpty?: boolean;
} & PassThrough) {
  const display = allowEmpty && value === 0 ? '' : String(value);
  const { text, setText, focused } = useNumericText(display);

  const settle = () => {
    focused.current = false;
    const parsed = parseNumeric(text);
    const next = clampTo(parsed ?? 0, min, max);
    setText(allowEmpty && next === 0 ? '' : String(next));
    onChange(next);
    onCommit?.(next);
  };

  return (
    <input
      {...rest}
      // Deliberately text: `type="number"` is what carries the bug, and its
      // spinners are useless at a table. inputMode still gives a phone the
      // numeric keypad.
      type="text"
      inputMode="numeric"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Reject the keystroke rather than mangling it, so the caret stays put.
        if (!PARTIAL.test(raw)) return;
        const tidy = stripLeadingZeros(raw);
        setText(tidy);
        onChange(clampWhileTyping(parseNumeric(tidy) ?? 0, max));
      }}
      onBlur={(e) => {
        settle();
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') settle();
        rest.onKeyDown?.(e);
      }}
    />
  );
}

/**
 * A number where blank is a real, distinct state — an un-rolled initiative, a
 * condition with no expiry. Empty emits `null` rather than collapsing to 0,
 * because "no initiative yet" and "initiative 0" are different facts.
 */
export function NullableNumberField({
  value,
  onChange,
  onCommit,
  min,
  max,
  ...rest
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  onCommit?: (next: number | null) => void;
  min?: number;
  max?: number;
} & PassThrough) {
  const display = value == null ? '' : String(value);
  const { text, setText, focused } = useNumericText(display);

  const settle = () => {
    focused.current = false;
    const parsed = parseNumeric(text);
    const next = parsed == null ? null : clampTo(parsed, min, max);
    setText(next == null ? '' : String(next));
    onChange(next);
    onCommit?.(next);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!PARTIAL.test(raw)) return;
        const tidy = stripLeadingZeros(raw);
        setText(tidy);
        const parsed = parseNumeric(tidy);
        onChange(parsed == null ? null : clampWhileTyping(parsed, max));
      }}
      onBlur={(e) => {
        settle();
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') settle();
        rest.onKeyDown?.(e);
      }}
    />
  );
}
