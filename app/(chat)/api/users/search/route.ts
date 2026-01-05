import { auth } from "@/app/(auth)/auth";
import { searchUsers } from "@/lib/db/queries";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

/**
 * GET /api/users/search?q=query
 * Search users by email or ID for share dialog autocomplete
 */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: StatusCodes.UNAUTHORIZED }
            );
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get("q");

        if (!query || query.trim().length < 2) {
            return NextResponse.json([]);
        }

        const users = await searchUsers({
            query,
            limit: 10,
            excludeUserId: session.user.id,
        });

        return NextResponse.json(users);
    } catch (error) {
        console.error("User search error:", error);
        return NextResponse.json(
            { error: "Failed to search users" },
            { status: StatusCodes.INTERNAL_SERVER_ERROR }
        );
    }
}
