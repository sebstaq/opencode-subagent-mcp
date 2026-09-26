import { color, mono } from "../theme";

/** Terminal-style window chrome. */
export const Window: React.FC<{
  title: string;
  width: number;
  height: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  accent?: string;
  fontSize?: number;
}> = ({ title, width, height, children, style, accent, fontSize = 28 }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 18,
      background: `linear-gradient(180deg, ${color.panelHi}, ${color.panel})`,
      border: `1px solid ${accent ? accent + "66" : color.line}`,
      boxShadow: `0 40px 120px rgba(0,0,0,0.6)${accent ? `, 0 0 60px ${accent}22` : ""}`,
      overflow: "hidden",
      ...style,
    }}
  >
    <div
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 22px",
        borderBottom: `1px solid ${color.line}`,
      }}
    >
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <div
          key={c}
          style={{ width: 14, height: 14, borderRadius: 7, background: c, opacity: 0.85 }}
        />
      ))}
      <div
        style={{
          flex: 1,
          textAlign: "center",
          fontFamily: mono,
          fontSize: 19,
          color: color.muted,
          marginRight: 60,
        }}
      >
        {title}
      </div>
    </div>
    <div
      style={{
        padding: "30px 38px",
        fontFamily: mono,
        fontSize,
        lineHeight: 1.6,
        color: color.text,
      }}
    >
      {children}
    </div>
  </div>
);
