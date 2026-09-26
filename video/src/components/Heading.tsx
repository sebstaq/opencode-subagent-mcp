import { useCurrentFrame } from "remotion";
import { glide, mix } from "../anim";
import { color, mono, sans } from "../theme";
import { Words, type Word } from "./Words";

/** Small mono kicker above a large headline, anchored top-left. */
export const Heading: React.FC<{ kicker: string; title: Word[]; start?: number }> = ({
  kicker,
  title,
  start = 0,
}) => {
  const frame = useCurrentFrame();
  const k = glide(frame, start, 30);
  return (
    <div style={{ position: "absolute", left: 140, top: 110, width: 1640 }}>
      <div
        style={{
          fontFamily: mono,
          fontSize: 24,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: color.sky,
          opacity: k,
          transform: `translateX(${mix(k, -20, 0)}px)`,
          marginBottom: 18,
        }}
      >
        {kicker}
      </div>
      <Words
        words={title}
        start={start + 6}
        stagger={4}
        style={{
          justifyContent: "flex-start",
          fontFamily: sans,
          fontWeight: 700,
          fontSize: 68,
          letterSpacing: -1.5,
          color: color.text,
        }}
      />
    </div>
  );
};
