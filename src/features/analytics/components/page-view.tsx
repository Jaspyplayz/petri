"use client";

import { track } from "@/shared/lib/track";
import { useMountEffect } from "@/shared/ui/effects/use-mount-effect";

export function PageView({ featureId }: { readonly featureId: string }) {
  useMountEffect(() => {
    track(featureId, "view");
  });
  return null;
}
