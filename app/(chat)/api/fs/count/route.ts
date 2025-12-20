import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { countFilesUnderFolders } from "@/lib/db/fs-queries";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

const countSchema = z.object({
    folderIds: z.array(z.number()),
});

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    try {
        const body = await request.json();
        const parsed = countSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: "folderIds must be an array of numbers" }, { status: StatusCodes.BAD_REQUEST });
        }

        const { folderIds } = parsed.data;

        const count = await countFilesUnderFolders(folderIds);

        return NextResponse.json({ count });
    } catch (error) {
        console.error("Error counting files:", error);
        return NextResponse.json({ error: "Failed to count files" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
    }
}
