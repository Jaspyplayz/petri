import { Suspense } from "react";
import { PageView } from "@/features/analytics";
import { BlobCreature, EvolvedLink, TeachBlobby } from "@/features/blob";
import { evolvedLine, evolvedTimes, HomeDiary } from "@/features/timeline";

export default function HomePage() {
  return (
    <>
      <PageView featureId="blob" />
      <div className="grid items-start gap-6 min-[900px]:grid-cols-2">
        <BlobCreature
          evolved={
            <Suspense fallback={<EvolvedLink label="Evolved … from visitor ideas" />}>
              <EvolvedCount />
            </Suspense>
          }
        />
        <div className="flex flex-col gap-4">
          <Suspense fallback={<div className="h-80 rounded-[28px] border border-ink/10 bg-card" />}>
            <HomeDiary />
          </Suspense>
          <TeachBlobby />
        </div>
      </div>
    </>
  );
}

async function EvolvedCount() {
  return <EvolvedLink label={evolvedLine(await evolvedTimes())} />;
}
