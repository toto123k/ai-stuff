import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { createFSErrorResponse } from "@/lib/db/fs-route-utils";
import { downloadFromS3, fsObjectToS3Key } from "@/lib/s3";
import { StatusCodes } from "http-status-codes";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fsObjects } from "@/lib/db/schema";
import { inArray, or } from "drizzle-orm";
import { isDescendantOf } from "@/lib/db/ltree-operators";
import JSZip from "jszip";

const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export const dynamic = "force-dynamic";

/**
 * Unified download endpoint for files, folders, and mixed selections.
 * 
 * POST /api/fs/download/batch
 * Body: { ids: number[] }
 * 
 * - Single file: Returns zip with the file
 * - Single folder: Returns zip with folder contents
 * - Mixed: Returns zip with everything, folder contents expanded
 */
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "לא מורשה" }, { status: StatusCodes.UNAUTHORIZED });
    }

    const body = await req.json();
    const { ids } = body as { ids: number[] };

    if (!ids || ids.length === 0) {
        return NextResponse.json({ error: "לא נבחרו פריטים להורדה" }, { status: StatusCodes.BAD_REQUEST });
    }

    // Get the selected objects
    const selectedObjects = await db
        .select()
        .from(fsObjects)
        .where(inArray(fsObjects.id, ids));

    if (selectedObjects.length === 0) {
        return createFSErrorResponse({ type: "OBJECT_NOT_FOUND" });
    }

    // Separate files and folders
    const selectedFiles = selectedObjects.filter(o => o.type === "file");
    const selectedFolders = selectedObjects.filter(o => o.type === "folder");

    // For each folder, get all descendants (files and subfolders for name mapping)
    let allDescendants: typeof selectedObjects = [];
    if (selectedFolders.length > 0) {
        // Build OR condition for all folder paths
        const folderConditions = selectedFolders.map(f => isDescendantOf(fsObjects.path, f.path));

        if (folderConditions.length === 1) {
            allDescendants = await db
                .select()
                .from(fsObjects)
                .where(folderConditions[0]);
        } else {
            allDescendants = await db
                .select()
                .from(fsObjects)
                .where(or(...folderConditions));
        }
    }

    // Combine: selected files + all descendants from folders
    const descendantFiles = allDescendants.filter(d => d.type === "file");
    const allFolders = [...selectedFolders, ...allDescendants.filter(d => d.type === "folder")];

    // Deduplicate files (in case a file was both selected and inside a selected folder)
    const fileMap = new Map<number, typeof selectedFiles[0]>();
    for (const file of [...selectedFiles, ...descendantFiles]) {
        fileMap.set(file.id, file);
    }
    const allFiles = Array.from(fileMap.values());

    if (allFiles.length === 0) {
        return NextResponse.json({ error: "אין קבצים להורדה" }, { status: StatusCodes.BAD_REQUEST });
    }

    // Build ID → name mapping for all folders
    const idToName = new Map<string, string>();
    for (const f of allFolders) {
        idToName.set(f.id.toString(), f.name);
    }

    // Create zip
    const zip = new JSZip();

    // Determine the common root for path calculation
    // If only one top-level item, use its path as root
    // If multiple, create folders at root level
    const useRootPrefix = selectedObjects.length > 1;

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

            // Build path in zip
            let relativePath: string;

            // Check if this file is a descendant of any selected folder
            const parentFolder = selectedFolders.find(f =>
                file.path.startsWith(f.path + ".") || file.path === f.path
            );

            if (parentFolder) {
                // File is inside a selected folder - build path relative to that folder
                const folderPathDepth = parentFolder.path.split(".").length;
                const filePathParts = file.path.split(".");
                const relativeParts = filePathParts.slice(folderPathDepth, -1);

                // Convert IDs to folder names
                const folderPath = relativeParts
                    .map(id => idToName.get(id) || id)
                    .join("/");

                // Include parent folder name as prefix
                const prefix = useRootPrefix ? parentFolder.name + "/" : "";
                relativePath = prefix + (folderPath ? `${folderPath}/${file.name}` : file.name);
            } else {
                // File was directly selected - put at root
                relativePath = file.name;
            }

            zip.file(relativePath, buffer);
        } catch (e) {
            console.error(`Failed to download file ${file.id}:`, e);
        }
    }

    // Generate zip
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Determine filename
    const zipName = selectedObjects.length === 1
        ? selectedObjects[0].name
        : "download";

    return new NextResponse(new Uint8Array(zipBuffer), {
        status: 200,
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(zipName)}.zip"`,
            "Content-Length": zipBuffer.length.toString(),
        },
    });
}
