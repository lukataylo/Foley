import { Composition, registerRoot } from "remotion";
import { Walkthrough } from "./Walkthrough";

const FPS = 30;

const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="walkthrough"
        component={Walkthrough}
        durationInFrames={FPS * 60}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ takeId: "master" }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
