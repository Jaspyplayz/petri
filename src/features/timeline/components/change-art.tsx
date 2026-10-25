import { BlobGlyph } from "@/shared/ui/blob-glyph";
import { diaryPortrait, type DiaryPhase, type DiaryScene } from "../lib/diary";

export function ChangeArt({
  scene,
  phase,
  width = 72,
  height = 72,
}: {
  readonly scene: DiaryScene;
  readonly phase: DiaryPhase;
  readonly width?: number;
  readonly height?: number;
}) {
  const portrait = diaryPortrait(scene, phase);
  return <BlobGlyph fill={portrait.fill} look={portrait.look} scale={portrait.scale} width={width} height={height} />;
}
