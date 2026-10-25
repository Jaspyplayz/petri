import type { Metadata } from "next";
import { PageView } from "@/features/analytics";
import { TimelineScreen } from "@/features/timeline";

export const metadata: Metadata = { title: "Blobby's changes" };

export default function TimelinePage() {
  return (
    <>
      <PageView featureId="timeline" />
      <TimelineScreen />
    </>
  );
}
