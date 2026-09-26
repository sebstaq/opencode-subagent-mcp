import { AbsoluteFill, useCurrentFrame } from "remotion";
import { color } from "../theme";

/** Deep background with a drifting dot grid, soft glows and a vignette. */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.12) % 48;
  return (
    <AbsoluteFill style={{ backgroundColor: color.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle, rgba(148,163,184,0.16) 1.2px, transparent 1.6px)`,
          backgroundSize: "48px 48px",
          backgroundPosition: `${drift}px ${drift * 0.5}px`,
          maskImage: "radial-gradient(ellipse 70% 65% at 50% 50%, black 30%, transparent 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 600px at ${30 + Math.sin(frame / 180) * 6}% 20%, rgba(56,189,248,0.10), transparent 70%),
            radial-gradient(800px 600px at ${75 + Math.cos(frame / 200) * 5}% 85%, rgba(232,131,95,0.07), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
