import { formatHeading } from "../lib/format-heading";

export function BlobPanel() {
  return (
    <section data-testid="blob-panel" aria-labelledby="blob-heading" className="space-y-2">
      <h2 id="blob-heading" data-testid="blob-heading" className="text-xl font-semibold">
        {formatHeading("Blob")}
      </h2>
    </section>
  );
}
