import { auth } from "@/app/(auth)/auth";
import { deleteObject, getObjects, updateObject } from "@/lib/db/fs-queries";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { ChatSDKError } from "@/lib/errors";
import z from "zod";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const { id } = await params;
    const folderId = parseInt(id);
    if (isNaN(folderId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: StatusCodes.BAD_REQUEST });
    }

    const objects = await getObjects(folderId, session.user.id);

    return Response.json(objects);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const { id } = await params;
    const folderId = parseInt(id);
    if (isNaN(folderId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: StatusCodes.BAD_REQUEST });
    }

    const result = await deleteObject(folderId, session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE folder handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
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
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const { id } = await params;
    const folderId = parseInt(id);
    if (isNaN(folderId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: StatusCodes.BAD_REQUEST });
    }

    const json = await request.json();
    const parsed = updateFolderSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: StatusCodes.BAD_REQUEST });
    }

    const result = await updateObject(folderId, parsed.data, session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH folder handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}