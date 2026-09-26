import { AbsoluteFill, useCurrentFrame } from "remotion";
import { glide, mix } from "../anim";
import { Words, words } from "../components/Words";
import { color, mono, sans } from "../theme";

const big: React.CSSProperties = {
  fontFamily: sans,
  fontWeight: 800,
  fontSize: 112,
  letterSpacing: -4,
  lineHeight: 1.12,
  color: color.text,
};

export const HOOK_FRAMES = 270;

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const tag = glide(frame, 150, 40);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <Words
          start={10}
          words={[{ text: "Opus", color: color.coral }, ...words("plans.")]}
          style={big}
        />
        <Words
          start={62}
          stagger={6}
          words={[{ text: "DeepSeek", color: color.sky }, ...words("does the legwork.")]}
          style={big}
        />
        <div
          style={{
            marginTop: 52,
            fontFamily: mono,
            fontSize: 30,
            color: color.muted,
            opacity: tag,
            transform: `translateY(${mix(tag, 16, 0)}px)`,
          }}
        >
          Claude Code subagents on any opencode model
        </div>
      </div>
    </AbsoluteFill>
  );
};
