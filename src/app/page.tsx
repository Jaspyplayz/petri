import { Suspense } from "react";
import { PageView } from "@/features/analytics";
import { BlobCreature, EvolvedLink } from "@/features/blob";
import { evolvedLine, evolvedTimes } from "@/features/timeline";

export default function HomePage() {
  return (
    <>
      <PageView featureId="blob" />
      <BlobCreature
        evolved={
          <Suspense fallback={<EvolvedLink label="Evolved … from visitor ideas" />}>
            <EvolvedCount />
          </Suspense>
        }
      />
    </>
  );
}

async function EvolvedCount() {
  return <EvolvedLink label={evolvedLine(await evolvedTimes())} />;
}
