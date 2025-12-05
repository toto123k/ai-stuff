import { auth } from "@/app/(auth)/auth";
import { getRootsWithHierarchy } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new ChatSDKError("unauthorized:chat").toResponse();
        }

        const { searchParams } = new URL(request.url);
        const depth = parseInt(searchParams.get("depth") || "3", 10);

        const result = await getRootsWithHierarchy(session.user.id, depth);

        return Response.json(result);
    } catch (error) {
        console.error("Tree API error:", error);
        if (error instanceof ChatSDKError) {
            return error.toResponse();
        }
        return new ChatSDKError("bad_request:database").toResponse();
    }
}
