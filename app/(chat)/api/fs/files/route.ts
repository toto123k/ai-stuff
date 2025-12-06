import { auth } from "@/app/(auth)/auth";
import { uploadFile } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";
import { z } from "zod";

const uploadSchema = z.object({
  parentId: z.coerce.number(),
  file: z.instanceof(File, { message: "File is required" }),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const formData = await request.formData();

    const parsedData = uploadSchema.parse({
      parentId: formData.get("parentId"),
      file: formData.get("file"),
    });

    const { parentId, file } = parsedData;

    const fileName = file.name;

    const fileBuffer = await file.arrayBuffer();

    console.log("Uploading:", fileName, "to Parent:", parentId);

    const uploadedFile = await uploadFile(
      parentId,
      fileName,
      session.user.id,
    );

    return Response.json(uploadedFile);
  } catch (error) {
    console.log(error);

    if (error instanceof z.ZodError) {
      return new ChatSDKError("bad_request:api").toResponse();
    }
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError("bad_request:database").toResponse();
  }
}