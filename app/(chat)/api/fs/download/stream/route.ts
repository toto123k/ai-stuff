import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getFile } from "@/lib/db/fs-queries";
import { downloadFromS3, fsObjectToS3Key } from "@/lib/s3";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { StatusCodes } from "http-status-codes";

export const dynamic = "force-dynamic";

// Proxy file download through our API to avoid CORS issues with S3
export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "לא מורשה" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");

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

    try {
        const stream = await downloadFromS3(s3Key);
        if (!stream) {
            return createFSErrorResponse({ type: "S3_OBJECT_NOT_FOUND", key: s3Key });
        }

        // Convert stream to buffer for Response
        const chunks: Uint8Array[] = [];
        const reader = stream.transformToWebStream().getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        const buffer = Buffer.concat(chunks);

        // Return the file with proper headers
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
                "Content-Length": buffer.length.toString(),
            },
        });
    } catch (e) {
        console.error("Failed to download from S3:", e);
        return createFSErrorResponse({ type: "S3_DOWNLOAD_FAILED", key: s3Key, cause: e });
    }
}
