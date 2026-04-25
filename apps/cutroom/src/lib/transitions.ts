// Transition spec + persistence. Transitions live alongside takes on disk
// at walkthroughs/<wid>/takes/<tid>/transitions.json. The director doesn't
// know about them; they're a cutroom-only concept for now.

export type TransitionFont = "serif" | "sans" | "mono" | "display";
export type TransitionLayout = "centered" | "hero-left" | "hero-right" | "grid";
export type TransitionBg =
  | "dark"
  | "light"
  | "gradient-purple"
  | "gradient-amber"
  | "gradient-graphite";

export interface TransitionSpec {
  id: string;
  text: string;
  subtext?: string;
  font: TransitionFont;
  layout: TransitionLayout;
  bg: TransitionBg;
  screenshot_step_ids: string[];
  typed: boolean;
  typed_strings?: string[]; // optional: cycle through a list of phrases
  duration_ms: number;
  /** Path under /walkthroughs/<wid>/genai/ if Nano Banana stylization ran. */
  stylized_url?: string | null;
}

export function newTransitionId(): string {
  return `t-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultTransition(): TransitionSpec {
  return {
    id: newTransitionId(),
    text: "Still manually maintaining videos?",
    subtext: "Let Foley keep them on-brand.",
    font: "display",
    layout: "centered",
    bg: "gradient-purple",
    screenshot_step_ids: [],
    typed: true,
    duration_ms: 4500,
    stylized_url: null,
  };
}
