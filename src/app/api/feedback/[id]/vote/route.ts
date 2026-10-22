import { handleVote } from "@/features/feedback";

export async function POST(request: Request, context: RouteContext<"/api/feedback/[id]/vote">): Promise<Response> {
  const { id } = await context.params;
  return handleVote(request, id);
}
