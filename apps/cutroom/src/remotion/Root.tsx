import { Composition, registerRoot } from "remotion";
import { Walkthrough } from "./Walkthrough";
import { TransitionComp, type TransitionCompProps } from "./TransitionComp";
import { TypedComp, type TypedCompProps } from "./TypedComp";
import type { TransitionSpec } from "../lib/transitions";

const FPS = 30;
const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;

const DEFAULT_TYPED_PROPS: TypedCompProps = {
  strings: ["Title slide preview"],
  font_family: "system-ui",
  font_size_px: 56,
  color: "#ffffff",
  bg_color: "aurora-pink",
  type_speed_ms: 42,
  back_speed_ms: 25,
  loop: false,
  show_cursor: true,
  cursor_char: "|",
  align: "center",
};

// Default props for the transition composition. These get overridden via
// inputProps in renderMedia, but they need to be valid so `remotion studio`
// and selectComposition() don't blow up before the real props arrive.
const DEFAULT_TRANSITION_SPEC: TransitionSpec = {
  id: "preview",
  kind: "title",
  text: "Title slide preview",
  font: "display",
  layout: "scatter",
  bg: "aurora-pink",
  screenshots: [],
  typed: false,
  duration_ms: 3000,
};

const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="walkthrough"
        component={Walkthrough}
        durationInFrames={FPS * 60}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{ takeId: "master" }}
      />
      <Composition
        id="transition"
        component={TransitionComp}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{ spec: DEFAULT_TRANSITION_SPEC, framesByStepId: {} } as TransitionCompProps}
      />
      <Composition
        id="typed"
        component={TypedComp}
        durationInFrames={FPS * 5}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={DEFAULT_TYPED_PROPS}
      />
    </>
  );
};

registerRoot(RemotionRoot);
