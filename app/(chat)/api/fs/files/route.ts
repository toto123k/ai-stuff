import { auth } from "@/app/(auth)/auth";
import { uploadFile } from "@/lib/db/fs-queries";
import { ChatSDKError } from "@/lib/errors";
import { z } from "zod";

// Update schema to handle FormData types
const uploadSchema = z.object({
  // FormData values are strings by default, so we coerce it to a number
  parentId: z.coerce.number(),
  // Validate that the input is actually a File instance
  file: z.instanceof(File, { message: "File is required" }),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // 1. Parse FormData instead of JSON
    const formData = await request.formData();

    // 2. Validate and extract data using the new schema
    // We construct an object from the formData getter to pass to Zod
    const parsedData = uploadSchema.parse({
      parentId: formData.get("parentId"),
      file: formData.get("file"),
    });

    const { parentId, file } = parsedData;

    // 3. Extract metadata directly from the File object
    const fileName = file.name;
    
    // Optional: Convert file to ArrayBuffer if uploadFile needs the raw data
    const fileBuffer = await file.arrayBuffer();

    console.log("Uploading:", fileName, "to Parent:", parentId);

    // 4. Pass the data to your DB/FS function
    // Note: You likely need to update `uploadFile` to accept the `fileBuffer` or `file` object
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