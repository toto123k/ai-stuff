import { auth } from "@/app/(auth)/auth";
import { getFile, updateObject, deleteObjectWithS3 } from "@/lib/db/fs-queries";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { getS3DownloadUrl, fsObjectToS3Key } from "@/lib/s3";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const { id } = await params;
    const fileId = parseInt(id);
    if (isNaN(fileId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: StatusCodes.BAD_REQUEST });
    }

    const result = await getFile(fileId, session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    const fsObject = result.value;

    // Only generate download URL for files, not folders
    if (fsObject.type === "file") {
      const s3Key = fsObjectToS3Key(fsObject);
      try {
        const downloadUrl = await getS3DownloadUrl(s3Key);
        return NextResponse.json({ ...fsObject, downloadUrl });
      } catch {
        // Return file info without download URL if S3 fails
        return NextResponse.json(fsObject);
      }
    }

    return NextResponse.json(fsObject);
  } catch (error) {
    console.error("GET file handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}

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
    const fileId = parseInt(id);
    if (isNaN(fileId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: StatusCodes.BAD_REQUEST });
    }

    const json = await request.json();
    const parsed = updateFileSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: StatusCodes.BAD_REQUEST });
    }

    const result = await updateObject(fileId, parsed.data, session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH file handler error:", error);
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
    const fileId = parseInt(id);
    if (isNaN(fileId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: StatusCodes.BAD_REQUEST });
    }

    const result = await deleteObjectWithS3(fileId, session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    return NextResponse.json({
      success: true,
      deletedCount: result.value.deletedCount,
      s3DeletedCount: result.value.s3DeletedCount,
      s3FailedCount: result.value.s3FailedCount
    });
  } catch (error) {
    console.error("DELETE file handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}
