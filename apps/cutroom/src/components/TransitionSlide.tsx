"use client";

import { TypedText } from "./TypedText";
import type { TransitionSpec } from "@/lib/transitions";

interface Props {
  spec: TransitionSpec;
  /** Public URLs of the step frames to use as floating screenshots. */
  screenshotUrls: string[];
  /** Force-restart the typed animation when this prop changes. */
  resetKey?: string | number;
  /** Override stylized image (bypasses bg + screenshots when set). */
  stylizedUrl?: string | null;
}

const FONT_FAMILY: Record<string, string> = {
  serif:   '"New York", "Cochin", Georgia, serif',
  sans:    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", sans-serif',
  mono:    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  display: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter", sans-serif',
};

const BG: Record<string, string> = {
  "dark":              "linear-gradient(180deg, #050507 0%, #0e0e14 100%)",
  "light":             "linear-gradient(180deg, #ffffff 0%, #f0f0f4 100%)",
  "gradient-purple":   "radial-gradient(ellipse at 30% 20%, #5b3eb8 0%, #1d1338 60%, #0a0612 100%)",
  "gradient-amber":    "radial-gradient(ellipse at 70% 30%, #f5a623 0%, #b3540a 60%, #2c1408 100%)",
  "gradient-graphite": "radial-gradient(ellipse at 50% 30%, #2a2a30 0%, #16161a 60%, #08080a 100%)",
};

export function TransitionSlide({ spec, screenshotUrls, resetKey, stylizedUrl }: Props) {
  // If we have a stylized PNG from Nano Banana, just render that full-bleed.
  if (stylizedUrl ?? spec.stylized_url) {
    return (
      <div
        className="transition-slide stylized"
        style={{ backgroundImage: `url(${stylizedUrl ?? spec.stylized_url})` }}
      />
    );
  }

  const isLight = spec.bg === "light";
  const fg = isLight ? "#0a0a0a" : "#ffffff";
  const sub = isLight ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.65)";
  const fontFamily = FONT_FAMILY[spec.font];
  const bgImage = BG[spec.bg];

  // Place each screenshot at a fixed offset / rotation per layout.
  const positions = layoutPositions(spec.layout, screenshotUrls.length);

  const headline = spec.typed ? (
    <TypedText
      strings={spec.typed_strings && spec.typed_strings.length ? spec.typed_strings : [spec.text]}
      typeSpeed={42}
      loop={Boolean(spec.typed_strings && spec.typed_strings.length > 1)}
      resetKey={resetKey}
    />
  ) : (
    <span>{spec.text}</span>
  );

  return (
    <div
      className={`transition-slide layout-${spec.layout} bg-${spec.bg}`}
      style={{ background: bgImage, color: fg, fontFamily }}
    >
      {screenshotUrls.map((url, i) => {
        const pos = positions[i];
        if (!pos) return null;
        return (
          <div
            key={`${url}-${i}`}
            className="ts-screenshot"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              width: `${pos.w}%`,
              transform: `rotate(${pos.r}deg)`,
              zIndex: pos.z,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" />
          </div>
        );
      })}

      <div className="ts-text">
        <h1 style={{ color: fg }}>{headline}</h1>
        {spec.subtext ? (
          <p style={{ color: sub }}>{spec.subtext}</p>
        ) : null}
      </div>
    </div>
  );
}

function layoutPositions(layout: string, count: number): { x: number; y: number; w: number; r: number; z: number }[] {
  // Positions in % relative to the slide. Up to 4 screenshots.
  switch (layout) {
    case "hero-left":
      return [
        { x: 5,  y: 18, w: 30, r: -3, z: 1 },
        { x: 8,  y: 58, w: 26, r:  4, z: 2 },
        { x: 38, y: 70, w: 22, r: -2, z: 3 },
        { x: 65, y: 12, w: 24, r:  5, z: 1 },
      ].slice(0, count);
    case "hero-right":
      return [
        { x: 65, y: 18, w: 30, r:  3, z: 1 },
        { x: 62, y: 58, w: 26, r: -4, z: 2 },
        { x: 40, y: 70, w: 22, r:  2, z: 3 },
        { x: 11, y: 12, w: 24, r: -5, z: 1 },
      ].slice(0, count);
    case "grid":
      return [
        { x: 8,  y: 12, w: 22, r:  0, z: 1 },
        { x: 70, y: 12, w: 22, r:  0, z: 1 },
        { x: 8,  y: 65, w: 22, r:  0, z: 1 },
        { x: 70, y: 65, w: 22, r:  0, z: 1 },
      ].slice(0, count);
    case "centered":
    default:
      return [
        { x: 4,  y: 8,  w: 22, r: -6, z: 1 },
        { x: 74, y: 8,  w: 22, r:  5, z: 1 },
        { x: 6,  y: 70, w: 22, r:  4, z: 1 },
        { x: 72, y: 70, w: 22, r: -5, z: 1 },
      ].slice(0, count);
  }
}
