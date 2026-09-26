import { AbsoluteFill, useCurrentFrame } from "remotion";
import { glide, mix, pop, ramp } from "../anim";
import { Heading } from "../components/Heading";
import { words } from "../components/Words";
import { color, mono, sans } from "../theme";

export const PERMISSIONS_FRAMES = 460;

const SAFE = ["pnpm test", "git diff --stat", 'rg "TODO" src', "pnpm build"];
const DANGER_AT = 40 + SAFE.length * 22;
const CARD_AT = DANGER_AT + 30;
const PICK_AT = CARD_AT + 110;
const OPTIONS = ["Allow once", "Allow for the rest of this agent's session", "Deny"];

const Cmd: React.FC<{ cmd: string; at: number; status: React.ReactNode; tone: string }> = ({
  cmd,
  at,
  status,
  tone,
}) => {
  const frame = useCurrentFrame();
  const t = glide(frame, at, 24);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontFamily: mono,
        fontSize: 30,
        color: color.text,
        padding: "14px 24px",
        borderRadius: 12,
        background: color.panel,
        border: `1px solid ${tone === color.amber ? color.amber + "99" : color.line}`,
        opacity: t,
        transform: `translateY(${mix(t, 20, 0)}px)`,
        marginBottom: 14,
      }}
    >
      <span>
        <span style={{ color: color.dim }}>$ </span>
        {cmd}
      </span>
      <span style={{ color: tone, fontSize: 24, alignSelf: "center" }}>{status}</span>
    </div>
  );
};

export const Permissions: React.FC = () => {
  const frame = useCurrentFrame();
  const card = pop(frame, CARD_AT, 150, 18);
  const picked = frame >= PICK_AT;
  const press = picked ? 1 - 0.04 * Math.sin(Math.min(1, (frame - PICK_AT) / 12) * Math.PI) : 1;
  const cardOut = ramp(frame, PICK_AT + 30, PICK_AT + 60);
  const pulse = frame >= DANGER_AT && !picked ? 0.5 + 0.5 * Math.sin((frame - DANGER_AT) / 6) : 0;
  return (
    <AbsoluteFill>
      <Heading kicker="Auto mode" title={words("It only asks when it matters.")} />
      <div style={{ position: "absolute", left: 140, top: 330, width: 720 }}>
        {SAFE.map((c, i) => (
          <Cmd key={c} cmd={c} at={40 + i * 22} tone={color.green} status="✓ allowed" />
        ))}
        <div style={{ boxShadow: `0 0 ${40 * pulse}px ${color.amber}55`, borderRadius: 12 }}>
          <Cmd
            cmd="rm -rf dist"
            at={DANGER_AT}
            tone={picked ? color.green : color.amber}
            status={picked ? "✓ allowed once" : "? waiting for you"}
          />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 960,
          top: 330,
          width: 820,
          padding: "34px 38px",
          borderRadius: 20,
          background: `linear-gradient(180deg, ${color.panelHi}, ${color.panel})`,
          border: `1px solid ${color.line}`,
          boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
          opacity: Math.min(1, card * 1.3) * (1 - cardOut * 0.55),
          transform: `translateX(${mix(Math.min(1, card), 60, 0)}px) scale(${mix(card, 0.92, 1)})`,
        }}
      >
        <div style={{ fontFamily: sans, fontSize: 26, color: color.muted, lineHeight: 1.5 }}>
          opencode agent <span style={{ color: color.text }}>&quot;Clean build output&quot;</span>
          <br />
          <span style={{ fontFamily: mono, fontSize: 22 }}>
            (opencode-go/deepseek-v4.1-flash)
          </span>{" "}
          wants to use bash:
        </div>
        <div style={{ fontFamily: mono, fontSize: 30, color: color.amber, margin: "16px 0 26px" }}>
          $ rm -rf dist
        </div>
        {OPTIONS.map((o, i) => {
          const active = i === 0;
          return (
            <div
              key={o}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                fontFamily: sans,
                fontSize: 26,
                padding: "12px 18px",
                marginBottom: 8,
                borderRadius: 12,
                color: active ? color.text : color.muted,
                background: active ? `${color.sky}1c` : "transparent",
                border: `1px solid ${active ? color.sky + "77" : "transparent"}`,
                transform: active ? `scale(${press})` : undefined,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  border: `2px solid ${active ? color.sky : color.dim}`,
                  background: active
                    ? `radial-gradient(circle, ${color.sky} 45%, transparent 50%)`
                    : "none",
                }}
              />
              {o}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
