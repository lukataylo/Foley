"use client";

import { useEffect, useState } from "react";
import { TypedText } from "./TypedText";
import type { TransitionSpec } from "@/lib/transitions";

interface Props {
  spec: TransitionSpec;
  framesByStepId: Record<string, string>;
  resetKey?: string | number;
}

const REVEAL_OFFSET: Record<string, { tx: number; ty: number }> = {
  bottom: { tx: 0,   ty: 60  },
  top:    { tx: 0,   ty: -60 },
  left:   { tx: -60, ty: 0   },
  right:  { tx: 60,  ty: 0   },
};

export function AngledMockupSlide({ spec, framesByStepId, resetKey }: Props) {
  const angled = spec.angled;
  const [revealed, setRevealed] = useState(false);

  // Trigger the reveal on mount and whenever resetKey changes.
  useEffect(() => {
    setRevealed(false);
    const timer = setTimeout(() => setRevealed(true), 30);
    return () => clearTimeout(timer);
  }, [resetKey]);

  if (!angled) return null;
  const url = framesByStepId[angled.step_id];

  const off = REVEAL_OFFSET[angled.reveal_from] ?? REVEAL_OFFSET.bottom;
  const baseTransform = `perspective(1400px) rotateX(${angled.rotate_x}deg) rotateY(${angled.rotate_y}deg) rotateZ(${angled.rotate_z}deg) scale(${angled.scale})`;
  const offTransform  = `translate(${off.tx}%, ${off.ty}%) ${baseTransform}`;

  const isLight = spec.bg === "paper";
  const fg = isLight ? "#0a0a0a" : "#ffffff";
  const sub = isLight ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.65)";

  return (
    <div
      className={`transition-slide bg-${spec.bg}`}
      style={{ color: fg, fontFamily: '"SF Pro Display", -apple-system, system-ui, sans-serif' }}
    >
      {/* aurora bg layer (matches title-kind) */}

      <div className="ts-grain" aria-hidden="true" />

      {/* Mockup block, animates from offscreen direction to anchor position */}
      {url ? (
        <div
          className="angled-mount"
          style={{
            top: `${angled.anchor_y - 30}%`,
            width: `${angled.width}%`,
          }}
        >
          <div
            className="angled-mockup"
            style={{
              transform: revealed ? baseTransform : offTransform,
              opacity: revealed ? 1 : 0,
              transition:
                "transform 900ms cubic-bezier(0.18, 0.68, 0.22, 1.02), opacity 700ms ease-out",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" />
            <div className="angled-glow" />
          </div>
        </div>
      ) : null}

      {/* Title — usually short. Typed if spec.typed is on. */}
      <div
        className="angled-title"
        style={{
          color: fg,
          // Shift title up if mockup anchored bottom, down if anchored top.
          top: angled.anchor_y > 50 ? "16%" : "70%",
        }}
      >
        {spec.typed ? (
          <h1>
            <TypedText
              strings={[spec.text]}
              typeSpeed={42}
              showCursor
              resetKey={resetKey}
            />
          </h1>
        ) : (
          <h1>{spec.text}</h1>
        )}
        {spec.subtext ? <p style={{ color: sub }}>{spec.subtext}</p> : null}
      </div>
    </div>
  );
}
