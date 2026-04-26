// Remotion composition that renders a single TransitionSpec to video. Used
// at export time by the export route — for each transition clip on the
// timeline we render an MP4 at the clip's duration, then ffmpeg overlays
// the result onto the master at the clip's start_ms.
//
// We reuse the editor's <TransitionSlide> for visual fidelity, swapping in
// a frame-deterministic typed-text renderer because typed.js depends on a
// wall-clock timer that doesn't progress under Remotion's headless render.

import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { useEffect, useState } from "react";
import { TransitionSlide } from "../components/TransitionSlide";
import type { TransitionSpec } from "../lib/transitions";
import { RemotionTypedText } from "./RemotionTypedText";
import "../app/globals.css";

// Composition props must satisfy Remotion's `Record<string, unknown>` shape,
// so we declare the type as an intersection rather than a plain interface.
export type TransitionCompProps = {
  spec: TransitionSpec;
  framesByStepId: Record<string, string>;
} & Record<string, unknown>;

export const TransitionComp: React.FC<TransitionCompProps> = ({ spec, framesByStepId }) => {
  // Block the first frame until every screenshot has decoded — otherwise
  // the early frames would render with empty <img> elements and show a
  // black slide for ~200ms before the screenshots pop in.
  const urls = spec.screenshots
    .map((s) => framesByStepId[s.step_id])
    .filter((u): u is string => !!u);
  const [handle] = useState(() => delayRender("transition-images"));
  const [ready, setReady] = useState(urls.length === 0);
  useEffect(() => {
    if (ready) {
      continueRender(handle);
      return;
    }
    let remaining = urls.length;
    const onOne = () => {
      remaining -= 1;
      if (remaining <= 0) {
        setReady(true);
        continueRender(handle);
      }
    };
    for (const u of urls) {
      const img = new window.Image();
      img.onload = onOne;
      img.onerror = onOne;
      img.src = u;
    }
  }, [urls, ready, handle]);

  return (
    <AbsoluteFill>
      <TransitionSlide
        spec={spec}
        framesByStepId={framesByStepId}
        renderHeadline={(strings) => (
          <RemotionTypedText
            strings={strings}
            cps={1000 / 42}
            loop={Boolean(spec.typed_strings && spec.typed_strings.length > 1)}
          />
        )}
      />
    </AbsoluteFill>
  );
};
