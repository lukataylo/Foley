// Remotion composition for the timeline's TypedClip — the title-card /
// callout / pull-quote overlay the user can drop on top of the master
// video. The editor renders these in real-time via TypedClipView; the
// export pipeline calls renderTyped() for each clip on the timeline and
// ffmpeg-overlays the resulting MP4 onto the master.
//
// Exact-pixel parity with TypedClipView isn't a goal — the editor uses
// CSS gradient backgrounds that don't travel cleanly into Remotion's
// bundle. Presets resolve to a representative flat color here. Solid
// colors and "transparent" (rendered as a 50% black scrim so the text
// stays legible over the video) round-trip fine.

import React from "react";
import { AbsoluteFill } from "remotion";
import { RemotionTypedText } from "./RemotionTypedText";

// Composition props must satisfy Remotion's `Record<string, unknown>` shape,
// so we declare the type as an intersection rather than a plain interface.
export type TypedCompProps = {
  strings: string[];
  font_family: string;
  font_size_px: number;
  color: string;
  bg_color: string;
  type_speed_ms: number;
  back_speed_ms: number;
  loop: boolean;
  show_cursor: boolean;
  cursor_char: string;
  align: "top" | "center" | "bottom";
} & Record<string, unknown>;

const PRESET_BG: Record<string, string> = {
  "aurora-amber": "#f5b94a",
  "aurora-pink": "#ec4899",
  "aurora-blue": "#3b82f6",
  "aurora-mint": "#34d399",
  "aurora-graphite": "#1f2937",
  void: "#0a0a0a",
  paper: "#fdf3d8",
};

function resolveBg(bg: string): string {
  if (!bg || bg === "transparent") return "rgba(0,0,0,0.55)";
  if (bg in PRESET_BG) return PRESET_BG[bg];
  return bg;
}

export const TypedComp: React.FC<TypedCompProps> = (props) => {
  const cps =
    props.type_speed_ms > 0 ? 1000 / props.type_speed_ms : 24;
  const backCps =
    props.back_speed_ms > 0 ? 1000 / props.back_speed_ms : 40;

  const justify =
    props.align === "top"
      ? "flex-start"
      : props.align === "bottom"
        ? "flex-end"
        : "center";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: resolveBg(props.bg_color),
        justifyContent: justify,
        alignItems: "center",
        fontFamily: props.font_family || "system-ui, -apple-system, Helvetica, sans-serif",
        fontSize: props.font_size_px || 56,
        color: props.color || "#ffffff",
        padding: "80px 120px",
        textAlign: "center",
        lineHeight: 1.2,
      }}
    >
      <div style={{ maxWidth: "92%", whiteSpace: "pre-wrap", textWrap: "balance" }}>
        <RemotionTypedText
          strings={props.strings}
          cps={cps}
          backCps={backCps}
          loop={props.loop}
          showCursor={props.show_cursor}
          cursorChar={props.cursor_char}
        />
      </div>
    </AbsoluteFill>
  );
};
