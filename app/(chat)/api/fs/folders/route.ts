import { auth } from "@/app/(auth)/auth";
import { createFolder } from "@/lib/db/fs-queries";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

const createFolderSchema = z.object({
  parentId: z.number(),
  name: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const json = await request.json();
    const parsed = createFolderSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: StatusCodes.BAD_REQUEST });
    }

    const { parentId, name } = parsed.data;

    const result = await createFolder(parentId, name, session.user.id);

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    return NextResponse.json(result.value);
  } catch (error) {
    console.error("Create folder handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}
