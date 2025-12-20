import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { downloadFromS3, fsObjectToS3Key } from "@/lib/s3";
import { StatusCodes } from "http-status-codes";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fsObjects } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { isDescendantOf } from "@/lib/db/ltree-operators";
import JSZip from "jszip";

const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export const dynamic = "force-dynamic";

// Download a folder as a zip file
export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "לא מורשה" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get("folderId");

    if (!folderId) {
        return NextResponse.json({ error: "מזהה תיקייה חסר" }, { status: StatusCodes.BAD_REQUEST });
    }

    // Get the folder first
    const [folder] = await db
        .select()
        .from(fsObjects)
        .where(eq(fsObjects.id, parseInt(folderId, 10)));

    if (!folder) {
        return createFSErrorResponse({ type: "OBJECT_NOT_FOUND", objectId: parseInt(folderId, 10) });
    }

    if (folder.type !== "folder") {
        return createFSErrorResponse({ type: "INVALID_OBJECT_TYPE", expected: "folder", got: folder.type });
    }

    // Get all descendants under this folder (files AND folders for name mapping)
    const allDescendants = await db
        .select()
        .from(fsObjects)
        .where(isDescendantOf(fsObjects.path, folder.path));

    // Separate files and folders
    const allFiles = allDescendants.filter(d => d.type === "file");
    const allFolders = allDescendants.filter(d => d.type === "folder");

    if (allFiles.length === 0) {
        return NextResponse.json({ error: "התיקייה ריקה" }, { status: StatusCodes.BAD_REQUEST });
    }

    // Build ID → name mapping for all folders (including the root folder)
    const idToName = new Map<string, string>();
    idToName.set(folder.id.toString(), folder.name);
    for (const f of allFolders) {
        idToName.set(f.id.toString(), f.name);
    }

    // Create zip with folder structure
    const zip = new JSZip();
    const folderPathDepth = folder.path.split(".").length;

    for (const file of allFiles) {
        try {
            const s3Key = fsObjectToS3Key(file);
            const stream = await downloadFromS3(s3Key);

            if (!stream) {
                console.error(`File not found in S3: ${s3Key}`);
                continue;
            }

            // Convert stream to buffer
            const chunks: Uint8Array[] = [];
            const reader = stream.transformToWebStream().getReader();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }

            const buffer = Buffer.concat(chunks);

            // Build relative path within zip using folder names
            // e.g., if folder path is "1.2.3" and file path is "1.2.3.4.5.6"
            // the relative IDs are [4, 5, 6] where 4, 5 are folder IDs and 6 is file ID
            const filePathParts = file.path.split(".");
            const relativeParts = filePathParts.slice(folderPathDepth, -1); // Exclude the file ID itself

            // Convert IDs to folder names
            const folderPath = relativeParts
                .map(id => idToName.get(id) || id)
                .join("/");

            const relativePath = folderPath ? `${folderPath}/${file.name}` : file.name;

            zip.file(relativePath, buffer);
        } catch (e) {
            console.error(`Failed to download file ${file.id}:`, e);
        }
    }

    // Generate zip
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(zipBuffer), {
        status: 200,
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(folder.name)}.zip"`,
            "Content-Length": zipBuffer.length.toString(),
        },
    });
}
