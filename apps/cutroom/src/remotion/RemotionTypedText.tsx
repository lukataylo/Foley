// Remotion-deterministic typed text. Replaces the runtime `typed.js` wrapper
// for export — Remotion renders one frame at a time with no continuous JS
// loop, so the wall-clock animation library would freeze on whichever frame
// it happened to mount on. Here we derive the visible substring from the
// current frame so every render produces the identical output.

import { useCurrentFrame, useVideoConfig } from "remotion";

interface Props {
  strings: string[];
  /** Characters per second. Default mirrors the editor's TypedText typeSpeed
   *  of 42ms/char (≈ 24 cps). */
  cps?: number;
  /** Hold time at the end of each string before backspacing (when looping). */
  holdMs?: number;
  /** Backspace speed in cps. */
  backCps?: number;
  /** When true, cycles through strings forever; otherwise stops at the end
   *  of the last string with the cursor blinking. */
  loop?: boolean;
  showCursor?: boolean;
  cursorChar?: string;
}

export function RemotionTypedText({
  strings,
  cps = 24,
  holdMs = 1200,
  backCps = 40,
  loop = false,
  showCursor = true,
  cursorChar = "|",
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsedMs = (frame / fps) * 1000;

  const text = computeTypedText(strings, elapsedMs, { cps, holdMs, backCps, loop });

  // Cursor blinks at 2Hz like the typed.js default. When cps=0 (instant) we
  // still want a blinking cursor.
  const cursorVisible = showCursor && Math.floor(elapsedMs / 500) % 2 === 0;

  return (
    <span>
      {text}
      {cursorVisible ? <span style={{ opacity: 0.85 }}>{cursorChar}</span> : null}
    </span>
  );
}

interface TypeOpts {
  cps: number;
  holdMs: number;
  backCps: number;
  loop: boolean;
}

/** Pure, frame-deterministic typing simulation. Exported for unit-style
 *  reasoning even though we don't ship tests for it — the math here drives
 *  the export pipeline so it has to be repeatable. */
export function computeTypedText(
  strings: string[],
  elapsedMs: number,
  { cps, holdMs, backCps, loop }: TypeOpts,
): string {
  if (strings.length === 0) return "";
  if (cps <= 0) return strings[0];
  const typeMsPerChar = 1000 / cps;
  const backMsPerChar = 1000 / Math.max(1, backCps);

  // For a single string: simple ramp, then sit on the full string forever.
  if (strings.length === 1 || !loop) {
    const s = strings[0];
    const fullMs = s.length * typeMsPerChar;
    if (elapsedMs >= fullMs) return s;
    const visible = Math.floor(elapsedMs / typeMsPerChar);
    return s.slice(0, Math.min(s.length, visible));
  }

  // Loop mode: type → hold → backspace → next. Walk the cycle until elapsedMs
  // lands inside one string's segment.
  let t = elapsedMs;
  let i = 0;
  for (;;) {
    const s = strings[i % strings.length];
    const typeMs = s.length * typeMsPerChar;
    const backMs = s.length * backMsPerChar;
    const cycle = typeMs + holdMs + backMs;
    if (t < typeMs) {
      const visible = Math.floor(t / typeMsPerChar);
      return s.slice(0, Math.min(s.length, visible));
    }
    if (t < typeMs + holdMs) return s;
    if (t < cycle) {
      const since = t - typeMs - holdMs;
      const removed = Math.floor(since / backMsPerChar);
      return s.slice(0, Math.max(0, s.length - removed));
    }
    t -= cycle;
    i += 1;
    // Safety cap so a runaway loop can't hang the renderer on a stuck frame.
    if (i > 1000) return s;
  }
}
