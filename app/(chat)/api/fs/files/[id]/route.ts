import { auth } from "@/app/(auth)/auth";
import { deleteObject, getFile, updateObject } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";
import { z } from "zod";

const updateFileSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.number().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { id } = await params;
    const fileId = parseInt(id);
    if (isNaN(fileId)) {
      return new ChatSDKError("bad_request:api").toResponse();
    }

    const file = await getFile(fileId, session.user.id);

    return Response.json(file);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError("bad_request:database").toResponse();
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { id } = await params;
    const fileId = parseInt(id);
    if (isNaN(fileId)) {
      return new ChatSDKError("bad_request:api").toResponse();
    }

    const json = await request.json();
    const updates = updateFileSchema.parse(json);

    await updateObject(fileId, updates, session.user.id);

    return Response.json({ success: true });
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { id } = await params;
    const fileId = parseInt(id);
    if (isNaN(fileId)) {
      return new ChatSDKError("bad_request:api").toResponse();
    }

    await deleteObject(fileId, session.user.id);

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError("bad_request:database").toResponse();
  }
}
