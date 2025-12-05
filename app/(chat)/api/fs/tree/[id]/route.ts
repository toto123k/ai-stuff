import { auth } from "@/app/(auth)/auth";
import { getTreeHierarchy } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new ChatSDKError("unauthorized:chat").toResponse();
        }

        const { id } = await params;
        const folderId = parseInt(id, 10);

        if (isNaN(folderId)) {
            return new ChatSDKError("bad_request:api").toResponse();
        }

        const { searchParams } = new URL(request.url);
        const depth = parseInt(searchParams.get("depth") || "3", 10);

        const tree = await getTreeHierarchy(folderId, session.user.id, depth);

        if (!tree) {
            return new ChatSDKError("not_found:chat").toResponse();
        }

        return Response.json(tree);
    } catch (error) {
        if (error instanceof ChatSDKError) {
            return error.toResponse();
        }
        return new ChatSDKError("bad_request:database").toResponse();
    }
}
