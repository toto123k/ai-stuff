import { auth } from "@/app/(auth)/auth";
import { copyObjects } from "@/lib/db/fs-queries";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { sourceIds, targetFolderId } = await request.json();

        if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
            return NextResponse.json(
                { error: "sourceIds must be a non-empty array" },
                { status: 400 }
            );
        }

        if (!targetFolderId || typeof targetFolderId !== "number") {
            return NextResponse.json(
                { error: "targetFolderId must be a number" },
                { status: 400 }
            );
        }

        const result = await copyObjects(sourceIds, targetFolderId, session.user.id);
        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error("Copy error:", error);
        const message = error instanceof Error ? error.message : "Failed to copy";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
