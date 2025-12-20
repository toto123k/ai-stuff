import { auth } from "@/app/(auth)/auth";
import { getRootsWithHierarchy } from "@/lib/db/fs-queries";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
        }

        const { searchParams } = new URL(request.url);
        const depth = parseInt(searchParams.get("depth") || "3", 10);

        const result = await getRootsWithHierarchy(session.user.id, depth);

        return Response.json(result);
    } catch (error) {
        console.error("Tree API error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
    }
}
