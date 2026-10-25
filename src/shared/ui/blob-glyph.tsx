import { useId, type AnimationEvent, type CSSProperties, type ReactNode } from "react";

const BODY_PATH =
  "M38 108C38 69.34 65.76 38 100 38C134.24 38 162 69.34 162 108C162 146.66 134.24 178 100 178C65.76 178 38 146.66 38 108Z";

const PATCHES = [
  { cx: 68, cy: 122, rx: 52, ry: 56, color: "#f7a3c8" },
  { cx: 124, cy: 74, rx: 50, ry: 48, color: "#8eb6f6" },
  { cx: 146, cy: 122, rx: 38, ry: 42, color: "#f6d56b" },
  { cx: 104, cy: 150, rx: 54, ry: 36, color: "#8fd9c2" },
  { cx: 56, cy: 86, rx: 30, ry: 32, color: "#d5b0ee" },
] as const;

const NUBS = [
  { cx: 74, cy: 40, r: 16, fill: "#f7a3c8" },
  { cx: 118, cy: 34, r: 20, fill: "#7eb4f3" },
  { cx: 40, cy: 108, r: 17, fill: "#c9a6e8" },
  { cx: 160, cy: 116, r: 20, fill: "#f2d56b" },
  { cx: 66, cy: 158, r: 15, fill: "#8ec6f0" },
  { cx: 138, cy: 160, r: 16, fill: "#7dcec0" },
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

function Nubs() {
  return (
    <>
      {NUBS.map((nub) => {
        const eye = Math.max(1.15, nub.r * 0.13);
        const dx = nub.r * 0.28;
        return (
          <g key={`${String(nub.cx)}-${String(nub.cy)}`}>
            <circle cx={nub.cx} cy={nub.cy} r={nub.r} fill={nub.fill} />
            <ellipse
              cx={nub.cx - nub.r * 0.28}
              cy={nub.cy - nub.r * 0.34}
              rx={nub.r * 0.42}
              ry={nub.r * 0.28}
              fill="#ffffff"
              opacity="0.7"
            />
            <circle cx={nub.cx - dx} cy={nub.cy - nub.r * 0.02} r={eye} className="fill-blob-face" />
            <circle cx={nub.cx + dx} cy={nub.cy - nub.r * 0.02} r={eye} className="fill-blob-face" />
            <path
              d={`M${String(nub.cx - dx)} ${String(nub.cy + nub.r * 0.28)}q${String(dx)} ${String(nub.r * 0.22)} ${String(dx * 2)} 0`}
              className="fill-none stroke-blob-face"
              strokeWidth={Math.max(1, nub.r * 0.09)}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </>
  );
}

function Decor({
  look,
  fill,
  clip,
  volume,
  blur,
}: {
  readonly look: BlobLook;
  readonly fill: string;
  readonly clip: string;
  readonly volume: string;
  readonly blur: string;
}) {
  if (look === "plain") {
    return <ellipse cx="82" cy="72" rx="22" ry="12" fill="#ffffff" opacity="0.55" />;
  }
  return (
    <>
      <defs>
        <radialGradient id={volume} cx="36%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="34%" style={{ stopColor: fill }} stopOpacity="0.55" />
          <stop offset="100%" stopColor="#163024" stopOpacity="0.42" />
        </radialGradient>
        <filter id={blur} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.15" />
        </filter>
        <clipPath id={clip}>
          <path d={BODY_PATH} />
        </clipPath>
        {PATCHES.map((patch, index) => (
          <radialGradient key={patch.color} id={`${volume}-p${String(index)}`} cx="42%" cy="38%" r="58%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="18%" stopColor={patch.color} />
            <stop offset="100%" stopColor={patch.color} />
          </radialGradient>
        ))}
      </defs>
      <g clipPath={`url(#${clip})`}>
        <g filter={`url(#${blur})`}>
          {PATCHES.map((patch, index) => (
            <ellipse
              key={`${String(patch.cx)}-${String(patch.cy)}`}
              cx={patch.cx}
              cy={patch.cy}
              rx={patch.rx}
              ry={patch.ry}
              fill={`url(#${volume}-p${String(index)})`}
            />
          ))}
        </g>
        <ellipse cx="112" cy="150" rx="46" ry="24" fill="#10261c" opacity="0.14" />
        <ellipse cx="82" cy="70" rx="18" ry="10" fill="#ffffff" opacity="0.42" />
      </g>
      <Nubs />
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
  const eyeRy = squint ? 2.6 : 14;
  return (
    <>
      {wink ? (
        <path d="M66 100q12 8 24 0" className="fill-none stroke-blob-face" strokeWidth="3.5" strokeLinecap="round" />
      ) : (
        <ellipse cx="78" cy="100" rx="12" ry={eyeRy} className="fill-blob-face" />
      )}
      <ellipse cx="122" cy="100" rx="12" ry={eyeRy} className="fill-blob-face" />
      {wink || squint ? null : <circle cx="82" cy="94" r="4" className="fill-white" />}
      {squint ? null : <circle cx="126" cy="94" r="4" className="fill-white" />}
      {eyelid ? (
        <g {...markerProps(eyelid)}>
          <ellipse cx="78" cy="100" rx="15" ry="17" />
          <ellipse cx="122" cy="100" rx="15" ry="17" />
          <path d="M64 102q14 8 28 0M108 102q14 8 28 0" className="fill-none stroke-blob-face" strokeWidth="3" strokeLinecap="round" />
        </g>
      ) : null}
      {mood === "fed" ? (
        <ellipse cx="100" cy="128" rx="13" ry="11" className="fill-blob-face" />
      ) : (
        <path d="M80 124q20 16 40 0" className="fill-none stroke-blob-face" strokeWidth="5" strokeLinecap="round" />
      )}
      <ellipse cx="58" cy="118" rx={rosy ? 14 : 9} ry={rosy ? 8 : 5} fill="#f6b7cf" opacity={rosy ? 1 : 0.7} />
      <ellipse cx="142" cy="118" rx={rosy ? 14 : 9} ry={rosy ? 8 : 5} fill="#f6b7cf" opacity={rosy ? 1 : 0.7} />
      {look === "squash" ? (
        <g className="fill-none stroke-spore" strokeWidth="3" strokeLinecap="round" opacity="0.9">
          <path d="M16 100q-8 6-4 14" />
          <path d="M184 98q8 6 4 14" />
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
  const plain = look === "plain";
  const artwork: ReactNode = (
    <>
      <path
        d={BODY_PATH}
        stroke={fill}
        strokeWidth={plain ? 4 : 0}
        fill={plain ? undefined : `url(#${uid}-volume)`}
        style={plain ? { fill: `color-mix(in srgb, ${fill} 72%, white)` } : undefined}
      />
      <Decor look={look} fill={fill} clip={`${uid}-clip`} volume={`${uid}-volume`} blur={`${uid}-blur`} />
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
    <svg viewBox="0 0 200 200" width={width} height={height} aria-hidden="true" overflow="visible" className={className}>
      {shadowRx !== undefined ? <ellipse cx="100" cy="182" rx={shadowRx} ry="8" className="fill-ink/15" /> : null}
      {framed}
    </svg>
  );
}
