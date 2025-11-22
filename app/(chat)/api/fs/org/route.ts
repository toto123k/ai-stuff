import { auth } from "@/app/(auth)/auth";
import { getOrganizationalRootFolders } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const roots = await getOrganizationalRootFolders(session.user.id);

    return Response.json(roots);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError("bad_request:database").toResponse();
  }
}
