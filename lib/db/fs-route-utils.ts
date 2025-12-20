import { NextResponse } from "next/server";
import { StatusCodes } from "http-status-codes";
import { FSError, UnexpectedError } from "./fs-errors";

/**
 * Centralized error mapping for all File System domain errors.
 * Exhaustiveness is handled here once, not in every route.
 */
const FS_ERROR_MAP: Record<FSError["type"], { status: StatusCodes; message: string }> = {
    // Permission errors
    NO_PERMISSION: { status: StatusCodes.FORBIDDEN, message: "Insufficient permissions" },
    NO_PERMISSION_ON_TARGET: { status: StatusCodes.FORBIDDEN, message: "Insufficient permissions on target" },
    NO_PERMISSION_ON_SOURCE: { status: StatusCodes.FORBIDDEN, message: "Insufficient permissions on source" },
    NO_PERMISSION_ON_DESCENDANTS: { status: StatusCodes.FORBIDDEN, message: "Insufficient permissions on contents" },

    // Not found errors
    OBJECT_NOT_FOUND: { status: StatusCodes.NOT_FOUND, message: "Object not found" },
    PARENT_NOT_FOUND: { status: StatusCodes.NOT_FOUND, message: "Parent folder not found" },
    USER_NOT_FOUND: { status: StatusCodes.NOT_FOUND, message: "User not found" },
    ROOT_NOT_FOUND: { status: StatusCodes.NOT_FOUND, message: "Root folder not found" },

    // Validation errors
    CANNOT_COPY_ROOT: { status: StatusCodes.BAD_REQUEST, message: "Cannot copy root folders" },
    CANNOT_MOVE_ROOT: { status: StatusCodes.BAD_REQUEST, message: "Cannot move root folders" },
    CROSS_ROOT_OPERATION: { status: StatusCodes.BAD_REQUEST, message: "Cannot operate between different roots" },
    INVALID_OBJECT_TYPE: { status: StatusCodes.BAD_REQUEST, message: "Invalid object type" },
    NAME_ALREADY_EXISTS: { status: StatusCodes.CONFLICT, message: "Name already exists" },

    // Storage errors
    STORAGE_LIMIT_EXCEEDED: { status: StatusCodes.INSUFFICIENT_STORAGE, message: "Storage limit exceeded" },
    FILE_TOO_LARGE: { status: StatusCodes.REQUEST_TOO_LONG, message: "File too large" },

    // S3 errors
    S3_UPLOAD_FAILED: { status: StatusCodes.INTERNAL_SERVER_ERROR, message: "Failed to upload file to storage" },
    S3_DOWNLOAD_FAILED: { status: StatusCodes.INTERNAL_SERVER_ERROR, message: "Failed to download file from storage" },
    S3_DELETE_FAILED: { status: StatusCodes.INTERNAL_SERVER_ERROR, message: "Failed to delete file from storage" },
    S3_COPY_FAILED: { status: StatusCodes.INTERNAL_SERVER_ERROR, message: "Failed to copy file in storage" },
    S3_OBJECT_NOT_FOUND: { status: StatusCodes.NOT_FOUND, message: "File not found in storage" },
    SAME_FOLDER_OPERATION: { status: StatusCodes.BAD_REQUEST, message: "Cannot copy/move to same folder" },
    CANNOT_WRITE_TO_TEMPORARY: { status: StatusCodes.BAD_REQUEST, message: "Cannot copy/move to temporary folders" },
    // Unexpected
    UNEXPECTED: { status: StatusCodes.INTERNAL_SERVER_ERROR, message: "An unexpected error occurred" },
};

/**
 * Centralized FS error response handler.
 * Maps domain errors to HTTP responses with optional per-route message overrides.
 * 
 * @param error - The FS error object
 * @param overrides - Optional message overrides for specific error types
 * @returns NextResponse with appropriate status code and error message
 * 
 * @example
 * ```ts
 * // Simple usage - one line
 * if (result.isErr()) {
 *     return fsResponse(result.error);
 * }
 * 
 * // With custom messages for specific errors
 * if (result.isErr()) {
 *     return fsResponse(result.error, {
 *         PARENT_NOT_FOUND: "Destination folder was deleted",
 *         NAME_ALREADY_EXISTS: "A file with this name already exists"
 *     });
 * }
 * ```
 */
export function createFSErrorResponse(
    error: FSError,
    overrides?: Partial<Record<FSError["type"], string>>
): NextResponse {
    const config = FS_ERROR_MAP[error.type];

    // Fallback for safety if a new error type is added but not mapped yet
    if (!config) {
        console.error(`[FS_RESPONSE] Unmapped error type: ${error.type}`);
        return NextResponse.json(
            { error: "Unknown error occurred" },
            { status: StatusCodes.INTERNAL_SERVER_ERROR }
        );
    }

    // Log unexpected errors for debugging
    if (error.type === "UNEXPECTED") {
        console.error("Unexpected FS Error:", (error as UnexpectedError).cause);
    }

    // Use override message if provided, otherwise use default
    const message = overrides?.[error.type] ?? config.message;

    // Include extra details for specific error types
    const responseBody: { error: string; conflictName?: string } = { error: message };
    if (error.type === "NAME_ALREADY_EXISTS" && "name" in error && error.name) {
        responseBody.conflictName = error.name;
    }

    return NextResponse.json(
        responseBody,
        { status: config.status }
    );
}
