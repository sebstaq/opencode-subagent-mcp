import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { glide, mix, ramp } from "../anim";
import { Heading } from "../components/Heading";
import { words } from "../components/Words";
import { color, mono, sans } from "../theme";

export const RECEIPT_FRAMES = 480;

// Straight from the agent's report while building this repo.
const LINES: { k: string; v: number; fmt: (n: number) => string }[] = [
  { k: "turns", v: 28, fmt: (n) => Math.round(n).toString() },
  { k: "wall time", v: 194.9, fmt: (n) => `${n.toFixed(1)} s` },
  { k: "tokens in", v: 1515173, fmt: (n) => Math.round(n).toLocaleString("en-US") },
  { k: "tokens out", v: 27616, fmt: (n) => Math.round(n).toLocaleString("en-US") },
];
const COST = 0.0321;
const COST_AT = 50 + LINES.length * 26 + 20;

const count = (frame: number, at: number, v: number): number =>
  interpolate(ramp(frame, at, at + 50), [0, 1], [0, v]);

export const Receipt: React.FC = () => {
  const frame = useCurrentFrame();
  const paper = glide(frame, 20, 50);
  const cost = count(frame, COST_AT, COST);
  const costIn = glide(frame, COST_AT, 30);
  const stamp = glide(frame, COST_AT + 70, 30);
  return (
    <AbsoluteFill>
      <Heading kicker="A real run" title={words("Researching this launch cost three cents.")} />
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 330,
          width: 860,
          padding: "36px 44px 40px",
          borderRadius: 20,
          background: `linear-gradient(180deg, ${color.panelHi}, ${color.panel})`,
          border: `1px solid ${color.line}`,
          boxShadow: "0 40px 100px rgba(0,0,0,0.55)",
          clipPath: `inset(0 0 ${mix(paper, 100, 0)}% 0 round 20px)`,
          fontFamily: mono,
        }}
      >
        <div
          style={{ fontSize: 22, color: color.dim, letterSpacing: 2, textTransform: "uppercase" }}
        >
          opencode agent
        </div>
        <div
          style={{
            fontFamily: sans,
            fontWeight: 600,
            fontSize: 34,
            color: color.text,
            margin: "8px 0 4px",
          }}
        >
          Research awesome lists for PRs
        </div>
        <div style={{ fontSize: 22, color: color.sky, marginBottom: 22 }}>
          opencode-go/deepseek-v4.1-flash
        </div>
        <div style={{ borderTop: `2px dashed ${color.line}`, marginBottom: 14 }} />
        {LINES.map((l, i) => {
          const at = 50 + i * 26;
          const t = glide(frame, at, 24);
          return (
            <div
              key={l.k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 30,
                lineHeight: 1.9,
                opacity: t,
              }}
            >
              <span style={{ color: color.muted }}>{l.k}</span>
              <span style={{ color: color.text }}>{l.fmt(count(frame, at, l.v))}</span>
            </div>
          );
        })}
        <div style={{ borderTop: `2px dashed ${color.line}`, margin: "14px 0" }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 34,
            opacity: costIn,
          }}
        >
          <span style={{ color: color.text, fontWeight: 700 }}>cost</span>
          <span style={{ color: color.green, fontWeight: 700 }}>${cost.toFixed(4)}</span>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1080,
          top: 360,
          width: 720,
          opacity: costIn,
          transform: `translateY(${mix(costIn, 30, 0)}px)`,
        }}
      >
        <div
          style={{
            fontFamily: sans,
            fontWeight: 800,
            fontSize: 250,
            letterSpacing: -10,
            lineHeight: 1,
            background: `linear-gradient(135deg, ${color.text}, ${color.sky})`,
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          ${cost.toFixed(2)}
        </div>
        <div
          style={{
            fontFamily: sans,
            fontSize: 32,
            color: color.muted,
            marginTop: 24,
            lineHeight: 1.45,
            opacity: stamp,
          }}
        >
          1.5 million tokens of reading lists, contributing guides and PR histories, in the
          background, while Claude kept working.
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 20,
            color: color.dim,
            marginTop: 28,
            opacity: stamp,
          }}
        >
          Cost as reported by opencode.
        </div>
      </div>
    </AbsoluteFill>
  );
};
