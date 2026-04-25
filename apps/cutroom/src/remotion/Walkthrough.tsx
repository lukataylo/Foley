import { AbsoluteFill } from "remotion";

// Used for in-cutroom preview only. The shipped master comes from
// services/director/concat.py via ffmpeg, not from Remotion render.
// This composition is for title cards, transitions, and scrubbable preview.

export const Walkthrough: React.FC<{ takeId: string }> = ({ takeId }) => {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a", color: "#f5f5f5" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 64, fontWeight: 600 }}>Foley</div>
        <div style={{ fontSize: 24, color: "#888", marginTop: 12 }}>take · {takeId}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
