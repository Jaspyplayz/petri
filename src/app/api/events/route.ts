import { handleEventRequest } from "@/features/analytics";

export async function POST(request: Request): Promise<Response> {
  return handleEventRequest(request);
}
