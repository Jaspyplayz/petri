import { handleCreateFeedback } from "@/features/feedback";

export async function POST(request: Request): Promise<Response> {
  return handleCreateFeedback(request);
}
