import { auth } from "@/app/(auth)/auth";
import { createFolder } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";
import { z } from "zod";

const createFolderSchema = z.object({
  parentId: z.number(),
  name: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const json = await request.json();
    const { parentId, name } = createFolderSchema.parse(json);

    const folder = await createFolder(parentId, name, session.user.id);

    return Response.json(folder);
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
