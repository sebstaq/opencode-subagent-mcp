import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { glide, mix, pop, ramp } from "../anim";
import { Heading } from "../components/Heading";
import { words } from "../components/Words";
import { color, mono, sans } from "../theme";

export const ARCH_FRAMES = 560;

type Box = { x: number; y: number; w: number; h: number };

const CLAUDE: Box = { x: 360, y: 600, w: 340, h: 130 };
const ANTHROPIC: Box = { x: 1560, y: 330, w: 340, h: 120 };
const MCP: Box = { x: 920, y: 790, w: 470, h: 130 };
const DEEPSEEK: Box = { x: 1610, y: 790, w: 300, h: 120 };
const AGENTS = [670, 790, 910].map((y) => ({ x: 1290, y }));

const TO_ANTHROPIC = `M ${CLAUDE.x + 170} ${CLAUDE.y - 20} C 900 ${CLAUDE.y - 20}, 1000 ${ANTHROPIC.y}, ${ANTHROPIC.x - 170} ${ANTHROPIC.y}`;
const TO_MCP = `M ${CLAUDE.x + 170} ${CLAUDE.y + 30} C 640 ${CLAUDE.y + 30}, 600 ${MCP.y}, ${MCP.x - 235} ${MCP.y}`;
const BRANCHES = AGENTS.map(
  (a) => `M ${MCP.x + 235} ${MCP.y} C 1180 ${MCP.y}, 1180 ${a.y}, ${a.x - 28} ${a.y}`,
);
const MERGES = AGENTS.map(
  (a) =>
    `M ${a.x + 28} ${a.y} C 1400 ${a.y}, 1400 ${DEEPSEEK.y}, ${DEEPSEEK.x - 150} ${DEEPSEEK.y}`,
);

const Wire: React.FC<{ d: string; start: number; c: string; dur?: number; dashed?: boolean }> = ({
  d,
  start,
  c,
  dur = 40,
}) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, start, start + dur);
  const { strokeDasharray, strokeDashoffset } = evolvePath(p, d);
  return (
    <>
      <path
        d={d}
        stroke={c}
        strokeOpacity={0.18}
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={strokeDasharray}
        strokeDashoffset={strokeDashoffset}
      />
      <path
        d={d}
        stroke={c}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={strokeDasharray}
        strokeDashoffset={strokeDashoffset}
      />
    </>
  );
};

const Flow: React.FC<{ d: string; start: number; c: string; count?: number; speed?: number }> = ({
  d,
  start,
  c,
  count = 4,
  speed = 5,
}) => {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const len = getLength(d);
  const fadeIn = ramp(frame, start, start + 30);
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const at = ((frame - start) * speed + (i * len) / count) % len;
        const pt = getPointAtLength(d, at);
        if (!pt) return null;
        const edge = Math.min(at / 60, (len - at) / 60, 1);
        return (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={6}
            fill={c}
            opacity={fadeIn * edge}
            style={{ filter: `drop-shadow(0 0 8px ${c})` }}
          />
        );
      })}
    </>
  );
};

const Node: React.FC<{ box: Box; at: number; title: string; sub: string; accent: string }> = ({
  box,
  at,
  title,
  sub,
  accent,
}) => {
  const frame = useCurrentFrame();
  const s = pop(frame, at);
  return (
    <div
      style={{
        position: "absolute",
        left: box.x - box.w / 2,
        top: box.y - box.h / 2,
        width: box.w,
        height: box.h,
        borderRadius: 20,
        background: `linear-gradient(180deg, ${color.panelHi}, ${color.panel})`,
        border: `1.5px solid ${accent}88`,
        boxShadow: `0 0 50px ${accent}22, 0 24px 60px rgba(0,0,0,0.5)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: Math.min(1, s * 1.5),
        transform: `scale(${mix(s, 0.6, 1)})`,
      }}
    >
      <div
        style={{
          fontFamily: sans,
          fontWeight: 700,
          fontSize: 34,
          color: color.text,
          letterSpacing: -0.5,
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
      <div style={{ fontFamily: mono, fontSize: 19, color: color.muted, marginTop: 6 }}>{sub}</div>
    </div>
  );
};

const Label: React.FC<{
  x: number;
  y: number;
  at: number;
  c: string;
  children: React.ReactNode;
}> = ({ x, y, at, c, children }) => {
  const frame = useCurrentFrame();
  const t = glide(frame, at, 30);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, ${mix(t, 10, 0)}px)`,
        opacity: t,
        fontFamily: mono,
        fontSize: 20,
        color: c,
        padding: "6px 14px",
        borderRadius: 999,
        background: "rgba(7,10,16,0.85)",
        border: `1px solid ${c}44`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
};

export const Architecture: React.FC = () => {
  const frame = useCurrentFrame();
  const caption = glide(frame, 400, 40);
  return (
    <AbsoluteFill>
      <Heading kicker="How it works" title={words("Only the subagents change route.")} />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <Wire d={TO_ANTHROPIC} start={50} c={color.coral} dur={50} />
        <Flow d={TO_ANTHROPIC} start={100} c={color.coral} count={5} speed={6} />
        <Wire d={TO_MCP} start={170} c={color.sky} />
        {BRANCHES.map((d, i) => (
          <Wire key={d} d={d} start={235 + i * 8} c={color.sky} dur={34} />
        ))}
        {MERGES.map((d, i) => (
          <Wire key={d} d={d} start={300 + i * 8} c={color.sky} dur={34} />
        ))}
        {[TO_MCP, ...BRANCHES, ...MERGES].map((d, i) => (
          <Flow key={d} d={d} start={350 + i * 3} c={color.sky} count={i === 0 ? 3 : 2} speed={4} />
        ))}
        {AGENTS.map((a, i) => {
          const s = pop(frame, 262 + i * 10, 180, 12);
          return (
            <g key={a.y} transform={`translate(${a.x} ${a.y}) scale(${Math.max(0, s)})`}>
              <circle r={40} fill={color.sky} opacity={0.12} />
              <circle r={26} fill={color.sky} />
            </g>
          );
        })}
      </svg>
      <Node box={CLAUDE} at={20} title="Claude Code" sub="main session" accent={color.coral} />
      <Node
        box={ANTHROPIC}
        at={92}
        title="Anthropic API"
        sub="Opus · Sonnet"
        accent={color.coral}
      />
      <Node
        box={MCP}
        at={200}
        title="opencode-subagent-mcp"
        sub="stdio · private opencode serve"
        accent={color.sky}
      />
      <Node box={DEEPSEEK} at={336} title="DeepSeek" sub="via opencode Go" accent={color.sky} />
      <Label x={1010} y={352} at={112} c={color.coral}>
        direct · never proxied
      </Label>
      <Label x={AGENTS[0]!.x} y={AGENTS[0]!.y - 92} at={290} c={color.sky}>
        subagents
      </Label>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 70,
          textAlign: "center",
          fontFamily: sans,
          fontSize: 30,
          color: color.muted,
          opacity: caption,
          transform: `translateY(${mix(caption, 14, 0)}px)`,
        }}
      >
        Your main session is untouched. Only delegated work goes to opencode.
      </div>
    </AbsoluteFill>
  );
};
