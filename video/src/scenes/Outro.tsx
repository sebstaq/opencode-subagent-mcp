import { evolvePath } from "@remotion/paths";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { glide, mix, pop, ramp } from "../anim";
import { color, mono, sans } from "../theme";

export const OUTRO_FRAMES = 480;

const STEM = "M128 102v32M128 134L72 170M128 134l56 36M128 134v36";

const Logo: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame();
  const box = pop(frame, 0, 120, 16);
  const head = pop(frame, 10, 200, 12);
  const stem = evolvePath(ramp(frame, 18, 48), STEM);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      style={{ transform: `scale(${mix(box, 0.4, 1)})`, opacity: Math.min(1, box * 1.5) }}
    >
      <rect width="256" height="256" rx="48" fill="#111827" stroke={color.line} strokeWidth={2} />
      <circle cx="128" cy="76" r={26 * Math.max(0, head)} fill="#f9fafb" />
      <path
        d={STEM}
        stroke="#f9fafb"
        strokeWidth={12}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={stem.strokeDasharray}
        strokeDashoffset={stem.strokeDashoffset}
      />
      {[72, 128, 184].map((cx, i) => (
        <circle
          key={cx}
          cx={cx}
          cy={186}
          r={18 * Math.max(0, pop(frame, 42 + i * 6, 220, 11))}
          fill={color.sky}
        />
      ))}
    </svg>
  );
};

const CMDS = [
  "claude plugin marketplace add sebstaq/opencode-subagent-mcp",
  "claude plugin install opencode-subagent-mcp@sebstaq-opencode",
];

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const title = glide(frame, 40, 40);
  const lift = glide(frame, 40, 60);
  const foot = glide(frame, 150, 40);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: `translateY(${mix(lift, 160, 0)}px)`,
        }}
      >
        <Logo size={170} />
        <div
          style={{
            fontFamily: sans,
            fontWeight: 800,
            fontSize: 84,
            letterSpacing: -3,
            color: color.text,
            marginTop: 36,
            opacity: title,
            filter: `blur(${mix(title, 10, 0)}px)`,
          }}
        >
          opencode-subagent-mcp
        </div>
        <div style={{ marginTop: 46, display: "flex", flexDirection: "column", gap: 14 }}>
          {CMDS.map((c, i) => {
            const t = glide(frame, 90 + i * 14, 30);
            return (
              <div
                key={c}
                style={{
                  fontFamily: mono,
                  fontSize: 30,
                  color: color.text,
                  padding: "16px 30px",
                  borderRadius: 14,
                  background: color.panel,
                  border: `1px solid ${color.line}`,
                  opacity: t,
                  transform: `translateY(${mix(t, 20, 0)}px)`,
                }}
              >
                <span style={{ color: color.dim }}>$ </span>
                {c}
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 44,
            fontFamily: mono,
            fontSize: 26,
            color: color.muted,
            opacity: foot,
          }}
        >
          <span style={{ color: color.sky }}>github.com/sebstaq/opencode-subagent-mcp</span>
          {"  ·  MIT  ·  npm  ·  MCP Registry"}
        </div>
      </div>
    </AbsoluteFill>
  );
};
