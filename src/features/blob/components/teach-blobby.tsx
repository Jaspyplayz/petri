import Link from "next/link";

export function TeachBlobby() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-full bg-teach px-6 py-4 shadow-[0_8px_24px_rgb(70_50_20/0.05)]">
      <p className="text-2xl font-extrabold tracking-tight">Teach Blobby</p>
      <Link
        href="/feedback"
        data-testid="blob-teach"
        className="shrink-0 rounded-full bg-lesson px-4 py-2 text-sm font-bold text-lesson-ink"
      >
        Suggest a lesson
      </Link>
    </div>
  );
}
