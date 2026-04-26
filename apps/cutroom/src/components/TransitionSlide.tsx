"use client";

import { TypedText } from "./TypedText";
import { AngledMockupSlide } from "./AngledMockupSlide";
import { FeatureZoomSlide } from "./FeatureZoomSlide";
import type { TransitionSpec } from "@/lib/transitions";

interface Props {
  spec: TransitionSpec;
  /** Map step_id → public PNG url. */
  framesByStepId: Record<string, string>;
  resetKey?: string | number;
  stylizedUrl?: string | null;
  /** Override the typed-text headline. Remotion's renderer passes a frame-
   *  deterministic version here because typed.js is wall-clock based and
   *  freezes during headless render. The default uses the live TypedText. */
  renderHeadline?: (strings: string[]) => React.ReactNode;
}

const FONT_FAMILY: Record<string, string> = {
  serif:   '"New York", "Cochin", Georgia, serif',
  sans:    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", sans-serif',
  mono:    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  display: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter", sans-serif',
};

export function TransitionSlide({ spec, framesByStepId, resetKey, stylizedUrl, renderHeadline }: Props) {
  // Stylized PNG from Nano Banana takes over completely.
  if (stylizedUrl ?? spec.stylized_url) {
    return (
      <div
        className="transition-slide stylized"
        style={{ backgroundImage: `url(${stylizedUrl ?? spec.stylized_url})` }}
      />
    );
  }

  // Dispatch by primitive kind.
  if (spec.kind === "angled-mockup") {
    return <AngledMockupSlide spec={spec} framesByStepId={framesByStepId} resetKey={resetKey} />;
  }
  if (spec.kind === "feature-zoom") {
    return <FeatureZoomSlide spec={spec} framesByStepId={framesByStepId} resetKey={resetKey} />;
  }

  const isLight = spec.bg === "paper";
  const fg = isLight ? "#0a0a0a" : "#ffffff";
  const sub = isLight ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.65)";
  const fontFamily = FONT_FAMILY[spec.font];

  const headlineStrings =
    spec.typed_strings && spec.typed_strings.length ? spec.typed_strings : [spec.text];
  const headline = renderHeadline ? (
    renderHeadline(headlineStrings)
  ) : spec.typed ? (
    <TypedText
      strings={headlineStrings}
      typeSpeed={42}
      loop={Boolean(spec.typed_strings && spec.typed_strings.length > 1)}
      resetKey={resetKey}
    />
  ) : (
    <span>{spec.text}</span>
  );

  return (
    <div
      className={`transition-slide bg-${spec.bg} layout-${spec.layout}`}
      style={{ color: fg, fontFamily }}
    >
      {/* aurora is composed via CSS pseudo-elements driven by .bg-* class */}
      {spec.screenshots.map((p, i) => {
        const url = framesByStepId[p.step_id];
        if (!url) return null;
        const blur = 0.18 + (p.shadow / 100) * 0.45;
        const spread = 4 + (p.shadow / 100) * 30;
        const yOff = 8 + (p.shadow / 100) * 22;
        const shadow = `0 ${yOff}px ${spread + 30}px rgba(0,0,0,${(blur * 0.9).toFixed(2)}), 0 4px 14px rgba(0,0,0,${blur.toFixed(2)})`;
        return (
          <div
            key={`${p.step_id}-${i}`}
            className="ts-screenshot"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.w}%`,
              transform: `rotate(${p.rotation}deg)`,
              zIndex: p.z,
              boxShadow: shadow,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" />
          </div>
        );
      })}

      {/* grain overlay drawn last so it sits above bg + screenshots */}
      <div className="ts-grain" aria-hidden="true" />

      <div className="ts-text">
        <h1 style={{ color: fg }}>{headline}</h1>
        {spec.subtext ? (
          <p style={{ color: sub }}>{spec.subtext}</p>
        ) : null}
      </div>
    </div>
  );
}
