import "server-only";
import { liveChangeCount } from "../lib/timeline-format";
import { countChanges } from "./list-timeline";

export async function evolvedTimes(): Promise<number> {
  const counts = await countChanges();
  return liveChangeCount(counts.changes, counts.reverts);
}
