import { NextRequest, NextResponse } from "next/server";
import { getLazyTree } from "@/lib/db/fs-queries";
import { auth } from "@/app/(auth)/auth";
import { StatusCodes } from "http-status-codes";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: StatusCodes.UNAUTHORIZED });
    }

    try {
        const body = await req.json();
        const { objectIds } = body;

        if (!objectIds || !Array.isArray(objectIds)) {
            return new NextResponse("Invalid request body", { status: StatusCodes.BAD_REQUEST });
        }

        const tree = await getLazyTree(objectIds, session.user.id);
        return NextResponse.json(tree);
    } catch (error) {
        console.error("Failed to fetch lazy tree:", error);
        return new NextResponse("Internal Server Error", { status: StatusCodes.INTERNAL_SERVER_ERROR });
    }
}
