import "server-only";
import { connection } from "next/server";
import { postingOpen } from "@/shared/lib/app-flags";
import { appFlags } from "@/shared/lib/flags-off-response";
import { FeedbackForm } from "./feedback-form";

export async function FeedbackPostArea() {
  await connection();
  const flags = await appFlags();
  if (postingOpen(flags)) return <FeedbackForm />;
  return (
    <p data-testid="feedback-closed-note" role="status" className="rounded-[28px] border border-ink/10 bg-card p-5 text-ink-soft shadow-[0_8px_24px_rgb(70_50_20/0.04)]">
      {flags.readOnly
        ? "Blobby is resting, so new lessons are paused. You can still read the board."
        : "New lessons are paused. You can still read the board and vote."}
    </p>
  );
}
