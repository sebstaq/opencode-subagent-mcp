import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const sans = loadInter("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
}).fontFamily;
export const mono = loadMono("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin"],
}).fontFamily;

export const color = {
  bg: "#070a10",
  panel: "#0d121b",
  panelHi: "#131a26",
  line: "#1e2735",
  text: "#f5f7fa",
  muted: "#8b97a8",
  dim: "#4b5668",
  sky: "#38bdf8",
  skyDeep: "#0ea5e9",
  coral: "#e8835f",
  green: "#4ade80",
  amber: "#fbbf24",
  red: "#f87171",
} as const;

export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;
