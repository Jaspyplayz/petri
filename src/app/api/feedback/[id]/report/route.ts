import { handleReport } from "@/features/feedback";

export async function POST(request: Request, context: RouteContext<"/api/feedback/[id]/report">): Promise<Response> {
  const { id } = await context.params;
  return handleReport(request, id);
}
