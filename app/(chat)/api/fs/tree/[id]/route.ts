import { auth } from "@/app/(auth)/auth";
import { getTreeHierarchy } from "@/lib/db/fs-queries";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

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
        const folderId = parseInt(id, 10);

        if (isNaN(folderId)) {
            return NextResponse.json({ error: "Invalid folder ID" }, { status: StatusCodes.BAD_REQUEST });
        }

        const { searchParams } = new URL(request.url);
        const depth = parseInt(searchParams.get("depth") || "3", 10);

        const tree = await getTreeHierarchy(folderId, session.user.id, depth);

        if (!tree) {
            return NextResponse.json({ error: "Folder not found or no permission" }, { status: StatusCodes.NOT_FOUND });
        }

        return Response.json(tree);
    } catch (error) {
        console.error("Tree hierarchy error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
    }
}
