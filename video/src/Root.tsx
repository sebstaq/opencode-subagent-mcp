import { Composition } from "remotion";
import { Demo, DEMO_FRAMES } from "./Demo";
import { FPS, HEIGHT, WIDTH } from "./theme";

export const Root: React.FC = () => (
  <Composition
    id="Demo"
    component={Demo}
    durationInFrames={DEMO_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
