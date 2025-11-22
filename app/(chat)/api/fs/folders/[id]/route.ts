import { auth } from "@/app/(auth)/auth";
import { deleteObject, getObjects, updateObject } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";
import z from "zod";

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
    const folderId = parseInt(id);
    if (isNaN(folderId)) {
      return new ChatSDKError("bad_request:api").toResponse();
    }

    const objects = await getObjects(folderId, session.user.id);

    return Response.json(objects);
  } catch (error) {
    console.log(error)
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
    const folderId = parseInt(id);
    if (isNaN(folderId)) {
      return new ChatSDKError("bad_request:api").toResponse();
    }

    await deleteObject(folderId, session.user.id);

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError("bad_request:database").toResponse();
  }
}

const updateFolderSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.number().optional(),
});


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
    const updates = updateFolderSchema.parse(json);

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