import {
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
    HeadObjectCommand,
    CopyObjectCommand,
    DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, S3_BUCKET } from "./client";
import type { FSObject } from "../db/schema";

/**
 * Convert a database ltree path to an S3 key.
 * For files: returns the full key (e.g., "123/456/789")
 * For folders: returns a prefix ending with "/" (e.g., "123/456/789/")
 */
export const fsObjectToS3Key = (obj: Pick<FSObject, "path" | "type">): string => {
    const key = obj.path.replace(/\./g, "/");
    return obj.type === "folder" ? `${key}/` : key;
};

/**
 * Convert a database ltree path to an S3 prefix (for listing/deletion).
 * Always ends with "/" to ensure proper prefix matching.
 */
export const dbPathToS3Prefix = (path: string): string => {
    return `${path.replace(/\./g, "/")}/`;
};

/**
 * Upload a file to S3
 */
export const uploadToS3 = async (
    key: string,
    body: Buffer | Uint8Array | string,
    contentType?: string
) => {
    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
    });

    return s3Client.send(command);
};

/**
 * Download a file from S3
 */
export const downloadFromS3 = async (key: string) => {
    const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
    });

    const response = await s3Client.send(command);
    return response.Body;
};

/**
 * Delete a single file from S3
 */
export const deleteFromS3 = async (key: string) => {
    const command = new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
    });

    return s3Client.send(command);
};

/**
 * Delete all objects under a prefix (for folder deletion)
 */
export const deleteS3Prefix = async (prefix: string): Promise<number> => {
    let deletedCount = 0;
    let continuationToken: string | undefined;

    do {
        const listCommand = new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        });

        const listResponse = await s3Client.send(listCommand);
        const objects = listResponse.Contents || [];

        if (objects.length > 0) {
            const deleteCommand = new DeleteObjectsCommand({
                Bucket: S3_BUCKET,
                Delete: {
                    Objects: objects.map((obj) => ({ Key: obj.Key })),
                },
            });

            await s3Client.send(deleteCommand);
            deletedCount += objects.length;
        }

        continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    return deletedCount;
};

/**
 * Copy all objects from one prefix to another (for folder copy)
 */
export const copyS3Prefix = async (
    sourcePrefix: string,
    destPrefix: string
): Promise<number> => {
    let copiedCount = 0;
    let continuationToken: string | undefined;

    do {
        const listCommand = new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: sourcePrefix,
            ContinuationToken: continuationToken,
        });

        const listResponse = await s3Client.send(listCommand);
        const objects = listResponse.Contents || [];

        for (const obj of objects) {
            if (!obj.Key) continue;

            // Replace source prefix with destination prefix
            const destKey = obj.Key.replace(sourcePrefix, destPrefix);

            const copyCommand = new CopyObjectCommand({
                Bucket: S3_BUCKET,
                CopySource: `${S3_BUCKET}/${obj.Key}`,
                Key: destKey,
            });

            await s3Client.send(copyCommand);
            copiedCount++;
        }

        continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    return copiedCount;
};

/**
 * List files in S3 with optional prefix
 */
export const listS3Objects = async (prefix?: string, maxKeys = 1000) => {
    const command = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
        MaxKeys: maxKeys,
    });

    const response = await s3Client.send(command);
    return response.Contents || [];
};

/**
 * Check if a file exists in S3
 */
export const s3ObjectExists = async (key: string): Promise<boolean> => {
    try {
        const command = new HeadObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
        });
        await s3Client.send(command);
        return true;
    } catch {
        return false;
    }
};

/**
 * Copy a single file within S3
 */
export const copyS3Object = async (sourceKey: string, destinationKey: string) => {
    const command = new CopyObjectCommand({
        Bucket: S3_BUCKET,
        CopySource: `${S3_BUCKET}/${sourceKey}`,
        Key: destinationKey,
    });

    return s3Client.send(command);
};

/**
 * Generate a presigned URL for downloading a file
 * @param key - S3 object key
 * @param filename - Optional filename for Content-Disposition header (forces download)
 * @param expiresInSeconds - URL expiration time
 */
export const getS3DownloadUrl = async (
    key: string,
    expiresInSeconds = 3600,
    filename?: string
): Promise<string> => {
    const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        // Force download instead of preview by setting Content-Disposition
        ...(filename && {
            ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
        }),
    });

    return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};

/**
 * Generate a presigned URL for uploading a file
 */
export const getS3UploadUrl = async (
    key: string,
    contentType?: string,
    expiresInSeconds = 3600
): Promise<string> => {
    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: contentType,
    });

    return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};
