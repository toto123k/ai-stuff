import { auth } from "@/app/(auth)/auth";
import { copyObjectsWithS3 } from "@/lib/db/fs-queries";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

const copySchema = z.object({
    sourceIds: z.array(z.number()),
    targetFolderId: z.number(),
    override: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    try {
        const json = await request.json();
        const parsed = copySchema.safeParse(json);

        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid input" }, { status: StatusCodes.BAD_REQUEST });
        }

        const { sourceIds, targetFolderId, override } = parsed.data;

        if (sourceIds.length === 0) {
            return NextResponse.json({ error: "sourceIds must be a non-empty array" }, { status: StatusCodes.BAD_REQUEST });
        }

        const result = await copyObjectsWithS3(sourceIds, targetFolderId, session.user.id, override);

        if (result.isErr()) {
            return createFSErrorResponse(result.error);
        }

        const { copiedCount, s3SuccessCount, s3FailCount } = result.value;

        // Return 207 Multi-Status if some S3 operations failed
        if (s3FailCount > 0) {
            return NextResponse.json(
                { copiedCount, s3SuccessCount, s3FailCount },
                { status: StatusCodes.MULTI_STATUS }
            );
        }

        return NextResponse.json({ copiedCount, s3SuccessCount, s3FailCount });
    } catch (error: unknown) {
        console.error("Copy handler error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
    }
}
