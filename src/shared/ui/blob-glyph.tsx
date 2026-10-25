import { useId, type AnimationEvent, type CSSProperties, type ReactNode } from "react";

const BODY_PATH =
  "M92 36c28-20 62-4 70 24 18 10 28 36 16 54 10 18-2 40-22 48-12 16-38 22-58 14-22 4-46-12-52-34-10-16-22-40-8-56 6-22 24-36 54-50z";

const BLOTCHES = [
  { cx: 78, cy: 120, rx: 42, ry: 36, fill: "#f4a3c8" },
  { cx: 128, cy: 70, rx: 40, ry: 30, fill: "#8ebff5" },
  { cx: 145, cy: 118, rx: 28, ry: 24, fill: "#f6d56b" },
  { cx: 100, cy: 145, rx: 40, ry: 24, fill: "#8fd9c0" },
  { cx: 70, cy: 78, rx: 26, ry: 22, fill: "#d7b0f0" },
  { cx: 112, cy: 108, rx: 18, ry: 16, fill: "#f7c98a" },
  { cx: 150, cy: 150, rx: 22, ry: 16, fill: "#f7b3d4" },
] as const;

export type BlobLook = "full" | "plain" | "wink" | "blush" | "squash";
export type BlobMood = "calm" | "poked" | "fed";

export type GlyphMarker = {
  readonly "data-testid": string;
  readonly className?: string | undefined;
  readonly "data-mood"?: BlobMood | undefined;
  readonly onAnimationEnd?: ((event: AnimationEvent<SVGGElement>) => void) | undefined;
};

type BlobGlyphProps = {
  readonly fill: string;
  readonly look?: BlobLook;
  readonly mood?: BlobMood;
  readonly scale?: number;
  readonly shadowRx?: number;
  readonly width?: number;
  readonly height?: number;
  readonly className?: string | undefined;
  readonly frameClassName?: string | undefined;
  readonly frameStyle?: CSSProperties;
  readonly poseKey?: number;
  readonly body?: GlyphMarker;
  readonly eyelid?: GlyphMarker;
};

function markerProps(marker: GlyphMarker | undefined): {
  readonly "data-testid"?: string;
  readonly className?: string;
  readonly "data-mood"?: BlobMood;
  readonly onAnimationEnd?: (event: AnimationEvent<SVGGElement>) => void;
} {
  if (!marker) return {};
  return {
    "data-testid": marker["data-testid"],
    ...(marker.className ? { className: marker.className } : {}),
    ...(marker["data-mood"] ? { "data-mood": marker["data-mood"] } : {}),
    ...(marker.onAnimationEnd ? { onAnimationEnd: marker.onAnimationEnd } : {}),
  };
}

function Decor({ look, clip, clay }: { readonly look: BlobLook; readonly clip: string; readonly clay: string }) {
  if (look === "plain") {
    return <ellipse cx="86" cy="70" rx="24" ry="13" fill="#ffffff" opacity="0.5" />;
  }
  return (
    <>
      <defs>
        <radialGradient id={clay} cx="32%" cy="26%" r="68%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="42%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#143026" stopOpacity="0.2" />
        </radialGradient>
        <clipPath id={clip}>
          <path d={BODY_PATH} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {BLOTCHES.map((blotch) => (
          <ellipse
            key={`${String(blotch.cx)}-${String(blotch.cy)}`}
            cx={blotch.cx}
            cy={blotch.cy}
            rx={blotch.rx}
            ry={blotch.ry}
            fill={blotch.fill}
          />
        ))}
        <ellipse cx="118" cy="148" rx="52" ry="30" fill="#1f2a24" opacity="0.1" />
        <ellipse cx="96" cy="78" rx="46" ry="32" fill={`url(#${clay})`} />
      </g>
    </>
  );
}

function Face({
  look,
  mood,
  eyelid,
}: {
  readonly look: BlobLook;
  readonly mood: BlobMood;
  readonly eyelid: GlyphMarker | undefined;
}) {
  const squint = mood === "poked" || look === "squash";
  const wink = look === "wink";
  const rosy = look === "blush" || mood === "fed";
  const eyeRy = squint ? 2.6 : 13;
  return (
    <>
      {wink ? (
        <path d="M66 100q12 8 24 0" className="fill-none stroke-blob-face" strokeWidth="3.5" strokeLinecap="round" />
      ) : (
        <ellipse cx="78" cy="96" rx="11" ry={eyeRy} className="fill-blob-face" />
      )}
      <ellipse cx="122" cy="96" rx="11" ry={eyeRy} className="fill-blob-face" />
      {wink || squint ? null : <circle cx="81" cy="91" r="3.6" className="fill-white" />}
      {squint ? null : <circle cx="125" cy="91" r="3.6" className="fill-white" />}
      {eyelid ? (
        <g {...markerProps(eyelid)}>
          <ellipse cx="78" cy="96" rx="14" ry="16" />
          <ellipse cx="122" cy="96" rx="14" ry="16" />
          <path d="M66 98q12 7 24 0M110 98q12 7 24 0" className="fill-none stroke-blob-face" strokeWidth="3" strokeLinecap="round" />
        </g>
      ) : null}
      {mood === "fed" ? (
        <ellipse cx="100" cy="128" rx="13" ry="11" className="fill-blob-face" />
      ) : (
        <path d="M80 122q20 18 40 0" className="fill-none stroke-blob-face" strokeWidth="5" strokeLinecap="round" />
      )}
      <ellipse cx="58" cy="116" rx={rosy ? 14 : 8} ry={rosy ? 8 : 5} fill="#f6b7cf" opacity={rosy ? 1 : 0.45} />
      <ellipse cx="142" cy="116" rx={rosy ? 14 : 8} ry={rosy ? 8 : 5} fill="#f6b7cf" opacity={rosy ? 1 : 0.45} />
      {look === "squash" ? (
        <g className="fill-none stroke-spore" strokeWidth="3" strokeLinecap="round" opacity="0.9">
          <path d="M18 96q-8 6-4 14" />
          <path d="M182 94q8 6 4 14" />
        </g>
      ) : null}
    </>
  );
}

export function BlobGlyph({
  fill,
  look = "full",
  mood = "calm",
  scale = 0.8,
  shadowRx,
  width = 260,
  height = 260,
  className,
  frameClassName,
  frameStyle,
  poseKey,
  body,
  eyelid,
}: BlobGlyphProps) {
  const uid = useId().replaceAll(":", "");
  const artwork: ReactNode = (
    <>
      <path
        d={BODY_PATH}
        stroke={fill}
        strokeWidth="5"
        style={{ fill: `color-mix(in srgb, ${fill} 58%, white)` }}
      />
      <Decor look={look} clip={`${uid}-clip`} clay={`${uid}-clay`} />
      <Face look={look} mood={mood} eyelid={eyelid} />
    </>
  );
  const posed =
    look === "squash" ? (
      <g transform="translate(100 124) scale(1.34 0.68) translate(-100 -124)">{artwork}</g>
    ) : (
      artwork
    );
  const framed = frameClassName ? (
    <g className={frameClassName} style={frameStyle}>
      <g key={poseKey} {...markerProps(body)} style={{ fill }}>
        {posed}
      </g>
    </g>
  ) : (
    <g transform={`translate(100 108) scale(${String(scale)}) translate(-100 -108)`}>
      <g key={poseKey} {...markerProps(body)} style={{ fill }}>
        {posed}
      </g>
    </g>
  );

  return (
    <svg viewBox="0 0 200 200" width={width} height={height} aria-hidden="true" className={className}>
      {shadowRx !== undefined ? <ellipse cx="100" cy="182" rx={shadowRx} ry="8" className="fill-ink/10" /> : null}
      {framed}
    </svg>
  );
}
