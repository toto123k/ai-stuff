import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getFile } from "@/lib/db/fs-queries";
import { getS3DownloadUrl, fsObjectToS3Key } from "@/lib/s3";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { StatusCodes } from "http-status-codes";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fsObjects } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export const dynamic = "force-dynamic";

// Get presigned URL for file viewing/opening (no Content-Disposition = previews in browser)
export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "לא מורשה" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");
    const forceDownload = searchParams.get("download") === "true";

    if (!fileId) {
        return NextResponse.json({ error: "מזהה קובץ חסר" }, { status: StatusCodes.BAD_REQUEST });
    }

    const result = await getFile(parseInt(fileId, 10), session.user.id);
    if (result.isErr()) {
        return createFSErrorResponse(result.error);
    }

    const file = result.value;
    if (file.type !== "file") {
        return createFSErrorResponse({ type: "INVALID_OBJECT_TYPE" });
    }

    const s3Key = fsObjectToS3Key(file);

    // Only pass filename if forceDownload is true (forces Content-Disposition: attachment)
    const url = await getS3DownloadUrl(s3Key, 3600, forceDownload ? file.name : undefined);

    return NextResponse.json({
        url,
        filename: file.name
    });
}

// Multiple files download - creates zip
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "לא מורשה" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const body = await req.json();
    const { fileIds } = body as { fileIds: number[] };

    if (!fileIds || fileIds.length === 0) {
        return NextResponse.json({ error: "לא נבחרו קבצים" }, { status: StatusCodes.BAD_REQUEST });
    }

    // For single file, just return presigned URL
    if (fileIds.length === 1) {
        const result = await getFile(fileIds[0], session.user.id);
        if (result.isErr()) {
            return NextResponse.json({ error: "שגיאה בהורדת קובץ" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
        }
        const file = result.value;
        const s3Key = fsObjectToS3Key(file);
        const url = await getS3DownloadUrl(s3Key, 3600, file.name);
        return NextResponse.json({ url, filename: file.name });
    }

    // For multiple files, we need to generate presigned URLs for each
    // The frontend will handle zipping (using JSZip) since streaming zip from edge is complex
    const files = await db
        .select()
        .from(fsObjects)
        .where(inArray(fsObjects.id, fileIds));

    const downloadInfos = await Promise.all(
        files.filter(f => f.type === "file").map(async (file) => {
            const s3Key = fsObjectToS3Key(file);
            const url = await getS3DownloadUrl(s3Key, 3600, file.name);
            return { url, filename: file.name };
        })
    );

    return NextResponse.json({ files: downloadInfos });
}
