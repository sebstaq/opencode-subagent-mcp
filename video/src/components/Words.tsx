import { useCurrentFrame } from "remotion";
import { glide, mix } from "../anim";

export type Word = { text: string; color?: string };

/** Words that rise and sharpen into place one after another. */
export const Words: React.FC<{
  words: Word[];
  start: number;
  stagger?: number;
  style?: React.CSSProperties;
}> = ({ words, start, stagger = 5, style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 0.28em",
        ...style,
      }}
    >
      {words.map((w, i) => {
        const t = glide(frame, start + i * stagger, 34);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              color: w.color,
              opacity: t,
              transform: `translateY(${mix(t, 38, 0)}px)`,
              filter: `blur(${mix(t, 12, 0)}px)`,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

export const words = (text: string, color?: string): Word[] =>
  text.split(" ").map((t) => ({ text: t, color }));
