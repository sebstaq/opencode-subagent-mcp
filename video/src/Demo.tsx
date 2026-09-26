import { springTiming, TransitionSeries } from "@remotion/transitions";
import { blurZoom } from "./components/blurZoom";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Background } from "./components/Background";
import { Architecture, ARCH_FRAMES } from "./scenes/Architecture";
import { Hook, HOOK_FRAMES } from "./scenes/Hook";
import { Outro, OUTRO_FRAMES } from "./scenes/Outro";
import { Parity, PARITY_FRAMES } from "./scenes/Parity";
import { Permissions, PERMISSIONS_FRAMES } from "./scenes/Permissions";
import { Receipt, RECEIPT_FRAMES } from "./scenes/Receipt";
import { Terminal, TERMINAL_FRAMES } from "./scenes/Terminal";

const TRANSITION = 30;

/** Slow push-in across each scene so nothing sits perfectly still. */
const Camera: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, frames], [0, 1]);
  return <AbsoluteFill style={{ transform: `scale(${1 + t * 0.035})` }}>{children}</AbsoluteFill>;
};

export const SCENES: { id: string; frames: number; Scene: React.FC }[] = [
  { id: "hook", frames: HOOK_FRAMES, Scene: Hook },
  { id: "terminal", frames: TERMINAL_FRAMES, Scene: Terminal },
  { id: "architecture", frames: ARCH_FRAMES, Scene: Architecture },
  { id: "parity", frames: PARITY_FRAMES, Scene: Parity },
  { id: "permissions", frames: PERMISSIONS_FRAMES, Scene: Permissions },
  { id: "receipt", frames: RECEIPT_FRAMES, Scene: Receipt },
  { id: "outro", frames: OUTRO_FRAMES, Scene: Outro },
];

export const DEMO_FRAMES =
  SCENES.reduce((sum, s) => sum + s.frames, 0) - TRANSITION * (SCENES.length - 1);

export const Demo: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <TransitionSeries>
      {SCENES.flatMap(({ id, frames, Scene }, i) => [
        ...(i > 0
          ? [
              <TransitionSeries.Transition
                key={`t-${id}`}
                presentation={blurZoom()}
                timing={springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION })}
              />,
            ]
          : []),
        <TransitionSeries.Sequence key={id} durationInFrames={frames}>
          <Camera frames={frames}>
            <Scene />
          </Camera>
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
  </AbsoluteFill>
);
