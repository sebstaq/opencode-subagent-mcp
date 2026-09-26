import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";
import { AbsoluteFill } from "remotion";

type Props = Record<string, never>;

/** Outgoing scene pushes forward and blurs away while the next one settles in from behind. */
const BlurZoom: React.FC<TransitionPresentationComponentProps<Props>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
}) => {
  const entering = presentationDirection === "entering";
  const style: React.CSSProperties = entering
    ? { opacity: p, transform: `scale(${0.94 + 0.06 * p})`, filter: `blur(${(1 - p) * 16}px)` }
    : { opacity: 1 - p, transform: `scale(${1 + 0.08 * p})`, filter: `blur(${p * 16}px)` };
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

export const blurZoom = (): TransitionPresentation<Props> => ({ component: BlurZoom, props: {} });
