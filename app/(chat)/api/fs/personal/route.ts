import { auth } from "@/app/(auth)/auth";
import { getPersonalRoot } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const result = await getPersonalRoot(session.user.id);

    return Response.json(result);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError("bad_request:database").toResponse();
  }
}
