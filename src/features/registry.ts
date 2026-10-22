import { analyticsManifest } from "./analytics/feature.manifest";
import { blobManifest } from "./blob/feature.manifest";
import { feedbackManifest } from "./feedback/feature.manifest";
import { timelineManifest } from "./timeline/feature.manifest";
import type { FeatureManifest } from "@/shared/lib/feature-manifest";

export const featureManifests: readonly FeatureManifest[] = [
  analyticsManifest,
  blobManifest,
  feedbackManifest,
  timelineManifest,
];
