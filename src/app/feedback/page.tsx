import type { Metadata } from "next";
import { PageView } from "@/features/analytics";
import { FeedbackScreen } from "@/features/feedback";

export const metadata: Metadata = { title: "Teach Blobby" };

export default function FeedbackPage({ searchParams }: PageProps<"/feedback">) {
  return (
    <>
      <PageView featureId="feedback" />
      <FeedbackScreen searchParams={searchParams} />
    </>
  );
}
