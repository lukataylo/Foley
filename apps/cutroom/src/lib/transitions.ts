// Transition spec + persistence. Transitions live alongside takes on disk
// at walkthroughs/<wid>/takes/<tid>/transitions.json.

export type TransitionKind = "title" | "angled-mockup" | "feature-zoom";

export type TransitionFont = "serif" | "sans" | "mono" | "display";
export type TransitionLayout =
  | "scatter"
  | "hero-cover-tl"
  | "hero-cover-tr"
  | "hero-cover-bl"
  | "hero-cover-br"
  | "split-vertical"
  | "stack"
  | "grid";
export type TransitionBg =
  | "aurora-pink"
  | "aurora-blue"
  | "aurora-amber"
  | "aurora-mint"
  | "aurora-graphite"
  | "void"
  | "paper";

export interface ScreenshotPlacement {
  step_id: string;
  x: number;        // 0..100, % from left of slide (top-left of the screenshot)
  y: number;        // 0..100, % from top of slide
  w: number;        // 0..200 (% of slide width — can exceed 100 for cover)
  rotation: number; // degrees, -45..45 typical
  shadow: number;   // 0..100, drop-shadow intensity
  z: number;        // stacking order (1..10)
}

/** Specs for the angled-mockup primitive — single screenshot tilted with
 *  perspective, optionally sliding in from one side. */
export interface AngledMockupSpec {
  step_id: string;
  rotate_x: number;   // degrees, around X axis (tilt forward/back)
  rotate_y: number;   // degrees, around Y axis (turn left/right)
  rotate_z: number;   // degrees, around Z axis (in-plane rotation)
  reveal_from: "bottom" | "top" | "left" | "right";
  scale: number;      // 0.5 .. 1.4
  /** % of slide width — controls how big the mockup reads. */
  width: number;      // 40 .. 130
  /** Vertical anchor (0 = top of slide, 100 = bottom). */
  anchor_y: number;   // 0..100
}

/** Specs for the feature-zoom primitive — zoom into a UI region with an
 *  oversized cursor pointing at a feature. */
export interface FeatureZoomSpec {
  step_id: string;
  zoom_x: number;        // 0..100, % of source frame (focal point)
  zoom_y: number;        // 0..100
  zoom_factor: number;   // 1.0 .. 4.0
  cursor_x: number;      // 0..100, % of viewport
  cursor_y: number;      // 0..100
  cursor_label?: string; // optional badge near the cursor
  cursor_size: number;   // 40..220 px
}

export interface TransitionSpec {
  id: string;
  /** Discriminator — which primitive to render. Defaults to "title". */
  kind: TransitionKind;

  text: string;
  subtext?: string;
  font: TransitionFont;
  layout: TransitionLayout;
  bg: TransitionBg;
  /** "title" kind: per-screenshot placements. */
  screenshots: ScreenshotPlacement[];
  /** Legacy field — pre-1.x transitions stored just step ids. Loader migrates. */
  screenshot_step_ids?: string[];
  typed: boolean;
  typed_strings?: string[];
  duration_ms: number;
  stylized_url?: string | null;

  /** "angled-mockup" kind. */
  angled?: AngledMockupSpec;
  /** "feature-zoom" kind. */
  feature?: FeatureZoomSpec;
}

export function newTransitionId(): string {
  return `t-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultTransition(kind: TransitionKind = "title"): TransitionSpec {
  const base: TransitionSpec = {
    id: newTransitionId(),
    kind,
    text: "Still manually maintaining videos?",
    subtext: "Let Foley keep them on-brand.",
    font: "display",
    layout: "scatter",
    bg: "aurora-pink",
    screenshots: [],
    typed: true,
    duration_ms: 4500,
    stylized_url: null,
  };
  if (kind === "angled-mockup") {
    base.text = "Take it for a spin";
    base.subtext = "";
    base.bg = "paper";
    base.angled = {
      step_id: "",
      rotate_x: 14,
      rotate_y: -22,
      rotate_z: -3,
      reveal_from: "bottom",
      scale: 1.0,
      width: 78,
      anchor_y: 60,
    };
  } else if (kind === "feature-zoom") {
    base.text = "Right where you'd expect it";
    base.subtext = "";
    base.bg = "aurora-pink";
    base.feature = {
      step_id: "",
      zoom_x: 50,
      zoom_y: 50,
      zoom_factor: 2.2,
      cursor_x: 50,
      cursor_y: 50,
      cursor_label: "click",
      cursor_size: 100,
    };
  }
  return base;
}

// ─── layout presets ─────────────────────────────────────────────────────────

const SCATTER: Omit<ScreenshotPlacement, "step_id">[] = [
  { x: -8,  y:  4,  w: 38, rotation: -7, shadow: 75, z: 1 },
  { x: 70,  y:  6,  w: 36, rotation:  6, shadow: 75, z: 1 },
  { x: -4,  y: 60,  w: 34, rotation:  4, shadow: 80, z: 1 },
  { x: 72,  y: 62,  w: 36, rotation: -5, shadow: 80, z: 1 },
];

const STACK: Omit<ScreenshotPlacement, "step_id">[] = [
  { x: 12,  y:  8,  w: 76, rotation: -2, shadow: 70, z: 1 },
  { x: 18,  y: 26,  w: 72, rotation:  1, shadow: 70, z: 2 },
  { x: 22,  y: 44,  w: 68, rotation: -1, shadow: 70, z: 3 },
];

const GRID: Omit<ScreenshotPlacement, "step_id">[] = [
  { x:  6,  y:  8,  w: 38, rotation: 0, shadow: 70, z: 1 },
  { x: 56,  y:  8,  w: 38, rotation: 0, shadow: 70, z: 1 },
  { x:  6,  y: 56,  w: 38, rotation: 0, shadow: 70, z: 1 },
  { x: 56,  y: 56,  w: 38, rotation: 0, shadow: 70, z: 1 },
];

const SPLIT_V: Omit<ScreenshotPlacement, "step_id">[] = [
  { x: -10, y:  8,  w: 60, rotation: -3, shadow: 80, z: 1 },
  { x: 50,  y: 14,  w: 60, rotation:  3, shadow: 80, z: 1 },
];

const HERO_COVER_TL: Omit<ScreenshotPlacement, "step_id">[] = [
  { x: -25, y: -20, w: 110, rotation: -4, shadow: 90, z: 1 },
  { x: 40,  y: 50,  w: 35,  rotation:  6, shadow: 70, z: 2 },
  { x: 76,  y: 18,  w: 30,  rotation: -3, shadow: 65, z: 2 },
];
const HERO_COVER_TR: Omit<ScreenshotPlacement, "step_id">[] = [
  { x: 15,  y: -20, w: 110, rotation:  4, shadow: 90, z: 1 },
  { x: 8,   y: 56,  w: 36,  rotation:  3, shadow: 70, z: 2 },
  { x: 60,  y: 64,  w: 32,  rotation: -2, shadow: 65, z: 2 },
];
const HERO_COVER_BL: Omit<ScreenshotPlacement, "step_id">[] = [
  { x: -25, y: 10,  w: 110, rotation:  4, shadow: 90, z: 1 },
  { x: 60,  y: -2,  w: 38,  rotation: -5, shadow: 70, z: 2 },
  { x: 64,  y: 60,  w: 30,  rotation:  3, shadow: 65, z: 2 },
];
const HERO_COVER_BR: Omit<ScreenshotPlacement, "step_id">[] = [
  { x: 15,  y: 10,  w: 110, rotation: -4, shadow: 90, z: 1 },
  { x:  4,  y:  6,  w: 34,  rotation:  4, shadow: 70, z: 2 },
  { x:  6,  y: 60,  w: 30,  rotation: -3, shadow: 65, z: 2 },
];

export function layoutDefaults(layout: TransitionLayout): Omit<ScreenshotPlacement, "step_id">[] {
  switch (layout) {
    case "scatter":         return SCATTER;
    case "stack":           return STACK;
    case "grid":            return GRID;
    case "split-vertical":  return SPLIT_V;
    case "hero-cover-tl":   return HERO_COVER_TL;
    case "hero-cover-tr":   return HERO_COVER_TR;
    case "hero-cover-bl":   return HERO_COVER_BL;
    case "hero-cover-br":   return HERO_COVER_BR;
    default:                return SCATTER;  // legacy values fall back gracefully
  }
}

const LAYOUT_ALIASES: Record<string, TransitionLayout> = {
  centered:     "scatter",
  "hero-left":  "hero-cover-tl",
  "hero-right": "hero-cover-tr",
};

export function normalizeLayout(layout: string): TransitionLayout {
  return (LAYOUT_ALIASES[layout] ?? layout) as TransitionLayout;
}

const BG_ALIASES: Record<string, TransitionBg> = {
  "gradient-purple":   "aurora-pink",
  "gradient-amber":    "aurora-amber",
  "gradient-graphite": "aurora-graphite",
  "dark":              "void",
  "light":             "paper",
};

export function normalizeBg(bg: string): TransitionBg {
  return (BG_ALIASES[bg] ?? bg) as TransitionBg;
}

/** Apply a layout preset to a list of step ids, producing placements. */
export function placementsForLayout(
  layout: TransitionLayout,
  stepIds: string[],
): ScreenshotPlacement[] {
  const defaults = layoutDefaults(layout);
  return stepIds.slice(0, defaults.length).map((sid, i) => ({
    step_id: sid,
    ...defaults[i],
  }));
}

/** Migrate legacy { screenshot_step_ids } + legacy layout/bg names. */
export function migrateTransition(spec: TransitionSpec): TransitionSpec {
  const layout = normalizeLayout(spec.layout);
  const bg = normalizeBg(spec.bg);
  const out: TransitionSpec = { ...spec, layout, bg };
  if (!spec.screenshots || spec.screenshots.length === 0) {
    const ids = spec.screenshot_step_ids ?? [];
    out.screenshots = placementsForLayout(layout, ids);
  }
  return out;
}
