import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { countFilesUnderFolders } from "@/lib/db/fs-queries";

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { folderIds } = body as { folderIds: number[] };

        if (!Array.isArray(folderIds)) {
            return NextResponse.json({ error: "folderIds must be an array" }, { status: 400 });
        }

        const count = await countFilesUnderFolders(folderIds);

        return NextResponse.json({ count });
    } catch (error) {
        console.error("Error counting files:", error);
        return NextResponse.json({ error: "Failed to count files" }, { status: 500 });
    }
}
