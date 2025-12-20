import { auth } from "@/app/(auth)/auth";
import { uploadFileWithContent } from "@/lib/db/fs-queries";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

const uploadSchema = z.object({
  parentId: z.coerce.number(),
  file: z.instanceof(File, { message: "File is required" }),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const formData = await request.formData();

    const parsedData = uploadSchema.safeParse({
      parentId: formData.get("parentId"),
      file: formData.get("file"),
    });

    if (!parsedData.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: StatusCodes.BAD_REQUEST });
    }

    const { parentId, file } = parsedData.data;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const result = await uploadFileWithContent(parentId, file.name, fileBuffer, file.type, session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    return NextResponse.json(result.value);
  } catch (error) {
    console.error("Upload handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}
