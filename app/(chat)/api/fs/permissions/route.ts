import { auth } from "@/app/(auth)/auth";
import { addPermission, getPermissions } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";
import { z } from "zod";

const addPermissionSchema = z.object({
  targetUserId: z.string().uuid(),
  folderId: z.number(),
  permission: z.enum(["read", "write", "admin"]),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const json = await request.json();
    const { targetUserId, folderId, permission } = addPermissionSchema.parse(json);

    const result = await addPermission(targetUserId, folderId, permission, session.user.id);

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new ChatSDKError("bad_request:api").toResponse();
    }
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError("bad_request:database").toResponse();
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");

  if (!folderId) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const permissions = await getPermissions(parseInt(folderId), session.user.id);

    return Response.json(permissions);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError("bad_request:database").toResponse();
  }
}
