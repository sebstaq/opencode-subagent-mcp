import { AbsoluteFill, useCurrentFrame } from "remotion";
import { glide, mix, pop, ramp, typed, typingDone } from "../anim";
import { Window } from "../components/Window";
import { color, mono, sans } from "../theme";

export const TERMINAL_FRAMES = 640;

const PROMPT = "Find the awesome lists this repo belongs in.";
const P0 = 30;
const CALL = typingDone(PROMPT, P0, 50) + 24;
const SPLIT = CALL + 50;
const FLY = SPLIT + 20;
const LAND = FLY + 44;
const STEPS_AT = LAND + 20;
const STEP_GAP = 24;

const MAIN = { left: 110, top: 220, width: 1100, height: 640 };
const SUB = { left: 1250, top: 220, width: 560, height: 640 };
const CENTER_SHIFT = (1920 - MAIN.width) / 2 - MAIN.left;

// What the subagent does, one tool call per line.
const STEPS: [string, string][] = [
  ["bash", "gh search repos awesome-mcp"],
  ["read", "CONTRIBUTING.md"],
  ["bash", "gh pr list --state merged"],
  ["fetch", "awesome-claude-code/README"],
  ["grep", '"Coding Agents"'],
  ["bash", "gh api …/awesome-opencode"],
  ["read", "data/schema.json"],
  ["fetch", "ccplugins/README.md"],
  ["write", "report"],
];
const DONE = STEPS_AT + STEPS.length * STEP_GAP + 20;
const VISIBLE = 7;

const Fade: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  const t = glide(frame, at, 26);
  return <div style={{ opacity: t, transform: `translateY(${mix(t, 14, 0)}px)` }}>{children}</div>;
};

const Spinner: React.FC<{ c: string }> = ({ c }) => {
  const frame = useCurrentFrame();
  const glyphs = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
  return <span style={{ color: c }}>{glyphs[Math.floor(frame / 4) % glyphs.length]} </span>;
};

const Line: React.FC<{ dot: string; children: React.ReactNode }> = ({ dot, children }) => (
  <div>
    <span style={{ color: dot }}>● </span>
    {children}
  </div>
);

const Sub: React.FC<{ children: React.ReactNode; c?: string }> = ({
  children,
  c = color.muted,
}) => (
  <div>
    <span style={{ color: color.dim }}>{"  ⎿ "}</span>
    <span style={{ color: c }}>{children}</span>
  </div>
);

export const Terminal: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = glide(frame, 0, 60);
  const split = glide(frame, SPLIT, 50);
  const pane = pop(frame, SPLIT + 10, 120, 18);
  const cursorOn = Math.floor(frame / 30) % 2 === 0;
  const running = frame >= CALL && frame < DONE;
  const done = frame >= DONE;

  // The task card flying from the tool call into the subagent pane.
  const fly = ramp(frame, FLY, LAND);
  const from = { x: MAIN.left + 60, y: MAIN.top + 150 };
  const to = { x: SUB.left + 30, y: SUB.top + 80 };
  const cardX = mix(fly, from.x, to.x);
  const cardY = mix(fly, from.y, to.y) - Math.sin(fly * Math.PI) * 140;
  const cardVisible = frame >= FLY && frame < LAND + 8;

  const steps = STEPS.slice(0, Math.max(0, Math.floor((frame - STEPS_AT) / STEP_GAP) + 1)).slice(
    -VISIBLE,
  );

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: MAIN.left,
          top: MAIN.top,
          opacity: enter,
          transform: `translate(${mix(split, CENTER_SHIFT, 0)}px, ${mix(enter, 70, 0)}px)`,
        }}
      >
        <Window
          title="claude — main session · Opus"
          width={MAIN.width}
          height={MAIN.height}
          fontSize={26}
          accent={color.coral}
        >
          <div>
            <span style={{ color: color.coral }}>{"> "}</span>
            {typed(PROMPT, frame, P0, 50)}
            {frame < CALL && (
              <span style={{ opacity: cursorOn ? 1 : 0, color: color.muted }}>▋</span>
            )}
          </div>
          <div style={{ height: 26 }} />
          <Fade at={CALL}>
            <Line dot={done ? color.green : color.sky}>
              <span style={{ fontWeight: 700 }}>opencode - agent</span>
              <span style={{ color: color.muted }}> (MCP)</span>
            </Line>
          </Fade>
          <Fade at={CALL + 10}>
            <div style={{ paddingLeft: 52, color: color.muted }}>
              model: <span style={{ color: color.sky }}>opencode-go/deepseek-v4.1-flash</span>
            </div>
          </Fade>
          <Fade at={CALL + 18}>
            <div style={{ paddingLeft: 52, color: color.muted }}>
              run_in_background: <span style={{ color: color.amber }}>true</span>
            </div>
          </Fade>
          <Fade at={CALL + 40}>
            <Sub>Started in the background</Sub>
          </Fade>
          <div style={{ height: 26 }} />
          <Fade at={STEPS_AT + 30}>
            <Line dot={color.text}>Meanwhile, I&apos;ll set up the release workflow.</Line>
          </Fade>
          <Fade at={STEPS_AT + 70}>
            <Sub>
              .github/workflows/release.yml <span style={{ color: color.green }}>+61</span>
            </Sub>
          </Fade>
          <Fade at={STEPS_AT + 120}>
            <Line dot={color.text}>pnpm check</Line>
          </Fade>
          <Fade at={STEPS_AT + 150}>
            <Sub c={color.green}>19 tests passed</Sub>
          </Fade>
          <div style={{ height: 26 }} />
          <Fade at={DONE + 20}>
            <Line dot={color.green}>
              opencode agent finished <span style={{ color: color.muted }}>· report ready</span>
            </Line>
          </Fade>
        </Window>
      </div>

      <div
        style={{
          position: "absolute",
          left: SUB.left,
          top: SUB.top,
          opacity: Math.min(1, pane * 1.4),
          transform: `translateX(${mix(Math.min(1, pane), 120, 0)}px) scale(${mix(pane, 0.9, 1)})`,
          transformOrigin: "left center",
        }}
      >
        <Window
          title="subagent · DeepSeek"
          width={SUB.width}
          height={SUB.height}
          fontSize={22}
          accent={color.sky}
        >
          <div
            style={{
              fontFamily: sans,
              fontWeight: 600,
              fontSize: 26,
              marginBottom: 6,
              opacity: frame >= LAND ? 1 : 0,
            }}
          >
            {done ? <span style={{ color: color.green }}>✓ </span> : <Spinner c={color.sky} />}
            Research awesome lists for PRs
          </div>
          <div
            style={{
              color: color.dim,
              fontSize: 19,
              marginBottom: 18,
              opacity: frame >= LAND ? 1 : 0,
            }}
          >
            opencode-go/deepseek-v4.1-flash
          </div>
          {steps.map(([tool, arg], i) => {
            const idx = STEPS.indexOf(steps[i]!);
            const t = glide(frame, STEPS_AT + idx * STEP_GAP, 18);
            return (
              <div
                key={idx}
                style={{
                  opacity: t,
                  transform: `translateX(${mix(t, 20, 0)}px)`,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: color.sky, display: "inline-block", width: 86 }}>{tool}</span>
                <span style={{ color: color.muted }}>{arg}</span>
              </div>
            );
          })}
          {done && (
            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: `1px dashed ${color.line}`,
                color: color.muted,
                opacity: glide(frame, DONE, 24),
              }}
            >
              28 turns · 194.9 s · <span style={{ color: color.green }}>$0.0321</span>
            </div>
          )}
        </Window>
      </div>

      {cardVisible && (
        <div
          style={{
            position: "absolute",
            left: cardX,
            top: cardY,
            padding: "12px 22px",
            borderRadius: 12,
            fontFamily: sans,
            fontWeight: 600,
            fontSize: 24,
            color: color.text,
            background: color.panelHi,
            border: `1.5px solid ${color.sky}`,
            boxShadow: `0 0 40px ${color.sky}66, 0 20px 40px rgba(0,0,0,0.5)`,
            transform: `scale(${mix(Math.sin(fly * Math.PI), 1, 1.12)}) rotate(${mix(fly, -4, 0)}deg)`,
            opacity: frame > LAND ? 1 - (frame - LAND) / 8 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: color.sky }}>→ </span>Research awesome lists for PRs
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 110,
          textAlign: "center",
          fontFamily: sans,
          fontSize: 30,
          color: color.muted,
          opacity: glide(frame, SPLIT + 30, 40) * (running ? 1 : 1),
        }}
      >
        The subagent runs on DeepSeek. Claude keeps working.
      </div>
    </AbsoluteFill>
  );
};
