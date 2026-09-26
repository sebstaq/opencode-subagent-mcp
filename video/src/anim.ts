import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Eased 0→1 progress between two frames. */
export const ramp = (
  frame: number,
  from: number,
  to: number,
  easing: (t: number) => number = Easing.bezier(0.22, 1, 0.36, 1),
): number => interpolate(frame, [from, to], [0, 1], { ...clamp, easing });

/** Maps a 0→1 progress onto an output range. */
export const mix = (t: number, a: number, b: number): number => a + (b - a) * t;

/** Critically damped spring that starts at `delay`. */
export const pop = (frame: number, delay: number, stiffness = 140, damping = 18): number =>
  spring({ frame: frame - delay, fps: FPS, config: { stiffness, damping, mass: 1 } });

/** Settled spring with no overshoot. */
export const glide = (frame: number, delay: number, durationInFrames = 40): number =>
  spring({ frame: frame - delay, fps: FPS, config: { damping: 200 }, durationInFrames });

/** Number of characters of `text` visible when typing `cps` chars/sec from `start`. */
export const typed = (text: string, frame: number, start: number, cps = 45): string =>
  text.slice(0, Math.max(0, Math.floor(((frame - start) / FPS) * cps)));

export const typingDone = (text: string, start: number, cps = 45): number =>
  start + Math.ceil((text.length / cps) * FPS);
