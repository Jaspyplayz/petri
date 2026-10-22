import { PageView } from "@/features/analytics";
import { BlobCreature } from "@/features/blob";

export default function HomePage() {
  return (
    <>
      <PageView featureId="blob" />
      <BlobCreature />
    </>
  );
}
