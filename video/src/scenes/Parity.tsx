import { AbsoluteFill, useCurrentFrame } from "remotion";
import { glide, mix, pop, ramp } from "../anim";
import { Heading } from "../components/Heading";
import { words } from "../components/Words";
import { color, mono, sans } from "../theme";

export const PARITY_FRAMES = 480;

const ROWS: [string, string, string][] = [
  ["Agent", "agent", "run a subagent"],
  ["SendMessage", "send_message", "resume with full history"],
  ["background runs", "wait", "collect when it's done"],
  ["TaskStop", "stop", "abort and keep the output"],
  ["/agents", "list", "agents and definitions"],
];

const CHIPS = [
  "worktree isolation",
  ".claude/agents definitions",
  "your permission rules",
  "structured output",
];

const Row: React.FC<{ row: [string, string, string]; at: number; y: number }> = ({
  row,
  at,
  y,
}) => {
  const frame = useCurrentFrame();
  const t = glide(frame, at, 30);
  const arrow = ramp(frame, at + 10, at + 34);
  const right = glide(frame, at + 22, 30);
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        top: y,
        width: 1640,
        height: 84,
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 420,
          fontFamily: mono,
          fontSize: 34,
          color: color.muted,
          opacity: t,
          transform: `translateX(${mix(t, -30, 0)}px)`,
        }}
      >
        {row[0]}
      </div>
      <svg width={160} height={40} style={{ opacity: t }}>
        <line
          x1={10}
          y1={20}
          x2={10 + 120 * arrow}
          y2={20}
          stroke={color.dim}
          strokeWidth={3}
          strokeLinecap="round"
        />
        {arrow > 0.95 && (
          <path
            d="M 122 10 L 134 20 L 122 30"
            stroke={color.dim}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
        )}
      </svg>
      <div
        style={{
          width: 400,
          marginLeft: 30,
          fontFamily: mono,
          fontWeight: 700,
          fontSize: 34,
          color: color.sky,
          opacity: right,
          transform: `translateX(${mix(right, 30, 0)}px)`,
        }}
      >
        {row[1]}
      </div>
      <div style={{ fontFamily: sans, fontSize: 28, color: color.dim, opacity: right }}>
        {row[2]}
      </div>
    </div>
  );
};

export const Parity: React.FC = () => {
  const frame = useCurrentFrame();
  const header = glide(frame, 30, 30);
  return (
    <AbsoluteFill>
      <Heading kicker="Parity" title={words("The subagent workflow you already use.")} />
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 300,
          width: 1640,
          display: "flex",
          fontFamily: mono,
          fontSize: 20,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: color.dim,
          opacity: header,
          borderBottom: `1px solid ${color.line}`,
          paddingBottom: 14,
        }}
      >
        <div style={{ width: 610 }}>Claude Code</div>
        <div>opencode MCP</div>
      </div>
      {ROWS.map((row, i) => (
        <Row key={row[1]} row={row} at={40 + i * 22} y={350 + i * 84} />
      ))}
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 830,
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          width: 1640,
        }}
      >
        {CHIPS.map((c, i) => {
          const s = pop(frame, 230 + i * 12, 170, 14);
          return (
            <div
              key={c}
              style={{
                fontFamily: sans,
                fontWeight: 600,
                fontSize: 28,
                color: color.text,
                padding: "14px 26px",
                borderRadius: 999,
                background: `${color.sky}14`,
                border: `1px solid ${color.sky}55`,
                opacity: Math.min(1, s * 1.4),
                transform: `scale(${mix(s, 0.5, 1)})`,
              }}
            >
              <span style={{ color: color.green }}>✓ </span>
              {c}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
