import { auth } from "@/app/(auth)/auth";
import { getRootStorageInfo, getRootIdFromPath } from "@/lib/db/fs-queries";
import { NextRequest, NextResponse } from "next/server";
import { StatusCodes } from "http-status-codes";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fsObjects, fsRoots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const searchParams = request.nextUrl.searchParams;
    const folderId = searchParams.get("folderId");

    if (!folderId) {
        return NextResponse.json({ error: "folderId is required" }, { status: StatusCodes.BAD_REQUEST });
    }

    const folderIdNum = parseInt(folderId, 10);
    if (isNaN(folderIdNum)) {
        return NextResponse.json({ error: "Invalid folderId" }, { status: StatusCodes.BAD_REQUEST });
    }

    // Get the root ID from the folder's path
    const [folder] = await db
        .select({ path: fsObjects.path })
        .from(fsObjects)
        .where(eq(fsObjects.id, folderIdNum));

    if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: StatusCodes.NOT_FOUND });
    }

    const rootId = getRootIdFromPath(folder.path);

    // Get root info (name and type)
    const [rootInfo] = await db
        .select({
            name: fsObjects.name,
            type: fsRoots.type,
        })
        .from(fsRoots)
        .innerJoin(fsObjects, eq(fsObjects.id, fsRoots.rootFolderId))
        .where(eq(fsRoots.rootFolderId, rootId));

    const storageInfo = await getRootStorageInfo(rootId);

    if (!storageInfo) {
        return NextResponse.json({ error: "Storage info not found" }, { status: StatusCodes.NOT_FOUND });
    }

    return NextResponse.json({
        rootId,
        rootName: rootInfo?.name ?? "Root",
        rootType: rootInfo?.type ?? "personal",
        usedBytes: storageInfo.usedBytes,
        maxBytes: storageInfo.maxBytes,
        remainingBytes: storageInfo.maxBytes - storageInfo.usedBytes,
        usagePercent: Math.round((storageInfo.usedBytes / storageInfo.maxBytes) * 100),
    });
}
