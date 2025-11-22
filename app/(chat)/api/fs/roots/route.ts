import { auth } from "@/app/(auth)/auth";
import { createCollectionRoot, getRoots } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";
import { z } from "zod";

const createRootSchema = z.object({
  type: z.enum(["personal", "organizational"]),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const json = await request.json();
    const { type } = createRootSchema.parse(json);

    const root = await createCollectionRoot(session.user.id, type);

    return Response.json(root);
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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const roots = await getRoots(session.user.id);
    return Response.json(roots);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError("bad_request:database").toResponse();
  }
}
