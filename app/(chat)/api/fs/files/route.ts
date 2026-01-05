import { auth } from "@/app/(auth)/auth";
import { uploadFileWithContent } from "@/lib/db/fs-queries";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";

const uploadSchema = z.object({
  parentId: z.coerce.number().optional(),
  file: z.instanceof(File, { message: "File is required" }),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const formData = await request.formData();

    const parsedData = uploadSchema.safeParse({
      parentId: formData.get("parentId") || undefined,
      file: formData.get("file"),
    });

    if (!parsedData.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: StatusCodes.BAD_REQUEST });
    }

    let { parentId } = parsedData.data;
    const { file } = parsedData.data;

    // If no parentId provided, use user's temporary root
    if (!parentId) {
      const { getTemporaryRoot } = await import("@/lib/db/fs-queries");
      const tempRoot = await getTemporaryRoot(session.user.id);
      if (!tempRoot.rootFolderId) {
        return NextResponse.json({ error: "Temporary root not found" }, { status: StatusCodes.NOT_FOUND });
      }
      parentId = tempRoot.rootFolderId;
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Check if uploading to temporary folder
    const { getFolderRootType } = await import("@/lib/db/fs-queries");
    const rootType = await getFolderRootType(parentId);

    let expiresAt: Date | undefined;
    if (rootType === "personal-temporary") {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
    }

    const result = await uploadFileWithContent(
      parentId,
      file.name,
      fileBuffer,
      file.type,
      session.user.id,
      { expiresAt }
    );

    if (result.isErr()) {
      return createFSErrorResponse(result.error);
    }

    // Generate download URL for the uploaded file
    const fsObject = result.value;
    const { getS3DownloadUrl, fsObjectToS3Key, uploadToS3 } = await import("@/lib/s3");
    const s3Key = fsObjectToS3Key(fsObject);
    const downloadUrl = await getS3DownloadUrl(s3Key);

    // If xlsx file, trigger async conversion to Parquet for faster future queries
    const isXlsx = file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      || file.name.endsWith(".xlsx");

    if (isXlsx) {
      // Fire and forget - don't block the response
      (async () => {
        try {
          const { convertXlsxToParquet, getSheetParquetKey } = await import("@/lib/converters/xlsx-to-parquet");
          const { updateFileMetadata } = await import("@/lib/db/fs-queries");

          const { schema, sheets: parquetBuffers } = await convertXlsxToParquet(fileBuffer);

          // Upload parquet files to S3
          for (const [tableName, buffers] of parquetBuffers) {
            const parquetKey = getSheetParquetKey(fsObject.id, tableName);
            await uploadToS3(parquetKey, buffers[0], "application/octet-stream");
          }

          // Save schema to file metadata
          await updateFileMetadata(fsObject.id, { spreadsheetSchema: schema });

          console.log(`[XLSX] Pre-converted to Parquet: ${file.name} (${schema.sheets.length} sheets)`);
        } catch (err) {
          console.warn(`[XLSX] Failed to pre-convert to Parquet for ${file.name}:`, err);
        }
      })();
    }

    return NextResponse.json({
      ...fsObject,
      // Map to fields expected by frontend if needed, or just standard fields
      downloadUrl,
      url: downloadUrl, // Alias for frontend compatibility often used
      pathname: fsObject.name, // Frontend compatibility
      contentType: fsObject.mimeType,
      isSpreadsheet: isXlsx, // Signal to frontend this file can be queried
    });
  } catch (error) {
    console.error("Upload handler error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}
