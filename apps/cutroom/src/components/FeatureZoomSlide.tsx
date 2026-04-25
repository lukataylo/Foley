"use client";

import { useEffect, useState } from "react";
import { TypedText } from "./TypedText";
import type { TransitionSpec } from "@/lib/transitions";

interface Props {
  spec: TransitionSpec;
  framesByStepId: Record<string, string>;
  resetKey?: string | number;
}

export function FeatureZoomSlide({ spec, framesByStepId, resetKey }: Props) {
  const f = spec.feature;
  const [phase, setPhase] = useState<"start" | "settled">("start");

  // Two-phase reveal: first the zoomed crop appears slightly bigger,
  // then settles, then the cursor enters from the corner.
  useEffect(() => {
    setPhase("start");
    const t = setTimeout(() => setPhase("settled"), 150);
    return () => clearTimeout(t);
  }, [resetKey]);

  if (!f) return null;
  const url = framesByStepId[f.step_id];

  const isLight = spec.bg === "paper";
  const fg = isLight ? "#0a0a0a" : "#ffffff";
  const sub = isLight ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.65)";

  // The crop is rendered as a wrapper with overflow hidden, with the source
  // image blown up by zoom_factor and translated so the focal point lands
  // at the wrapper's center.
  const innerWidthPct = 100 * f.zoom_factor;
  const innerLeftPct  = -(f.zoom_x * (f.zoom_factor - 1));
  const innerTopPct   = -(f.zoom_y * (f.zoom_factor - 1));

  return (
    <div
      className={`transition-slide bg-${spec.bg}`}
      style={{ color: fg, fontFamily: '"SF Pro Display", -apple-system, system-ui, sans-serif' }}
    >
      <div className="ts-grain" aria-hidden="true" />

      {/* The cropped, zoomed window — sits centred and large */}
      {url ? (
        <div
          className="fz-window"
          style={{
            transform: phase === "start" ? "scale(0.96)" : "scale(1)",
            opacity: phase === "start" ? 0.7 : 1,
            transition: "transform 600ms cubic-bezier(0.2, 0.7, 0.2, 1.0), opacity 500ms ease-out",
          }}
        >
          <div className="fz-crop">
            <div
              className="fz-inner"
              style={{
                width: `${innerWidthPct}%`,
                left:  `${innerLeftPct}%`,
                top:   `${innerTopPct}%`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" />
            </div>
          </div>
        </div>
      ) : null}

      {/* Cursor SVG + optional label */}
      <Cursor
        x={f.cursor_x}
        y={f.cursor_y}
        size={f.cursor_size}
        label={f.cursor_label}
        active={phase === "settled"}
      />

      {/* Optional title — small + above */}
      {spec.text ? (
        <div className="fz-title" style={{ color: fg }}>
          {spec.typed ? (
            <h2><TypedText strings={[spec.text]} typeSpeed={42} resetKey={resetKey} /></h2>
          ) : (
            <h2>{spec.text}</h2>
          )}
          {spec.subtext ? <p style={{ color: sub }}>{spec.subtext}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Cursor({ x, y, size, label, active }: {
  x: number; y: number; size: number; label?: string; active: boolean;
}) {
  return (
    <div
      className={`fz-cursor ${active ? "active" : ""}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
      }}
    >
      <svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
        <defs>
          <filter id="fz-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="3" stdDeviation="2" floodOpacity="0.45" />
          </filter>
        </defs>
        <path
          d="M5 4 L5 27 L11 22 L14 30 L18 28 L15 20 L23 20 Z"
          fill="#ffffff"
          stroke="#1d1d1f"
          strokeWidth="1.6"
          strokeLinejoin="round"
          filter="url(#fz-shadow)"
        />
      </svg>
      {label ? <span className="fz-cursor-label">{label}</span> : null}
    </div>
  );
}
