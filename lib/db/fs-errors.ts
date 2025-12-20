// Permission errors
export type PermissionError =
    | { type: "NO_PERMISSION"; resource: "folder" | "file"; required: "read" | "write" | "admin" | "owner" }
    | { type: "NO_PERMISSION_ON_TARGET"; folderId: number }
    | { type: "NO_PERMISSION_ON_SOURCE"; objectId: number }
    | { type: "NO_PERMISSION_ON_DESCENDANTS" };

// Not found errors
export type NotFoundError =
    | { type: "OBJECT_NOT_FOUND"; objectId?: number }
    | { type: "PARENT_NOT_FOUND"; parentId?: number }
    | { type: "USER_NOT_FOUND"; userId?: string }
    | { type: "ROOT_NOT_FOUND"; rootType?: string };

// Validation errors
export type ValidationError =
    | { type: "CANNOT_COPY_ROOT" }
    | { type: "CANNOT_MOVE_ROOT" }
    | { type: "CROSS_ROOT_OPERATION" }
    | { type: "INVALID_OBJECT_TYPE"; expected?: string; got?: string }
    | { type: "NAME_ALREADY_EXISTS"; name?: string; parentId?: number };

// Storage errors
export type StorageError =
    | { type: "STORAGE_LIMIT_EXCEEDED"; used?: number; limit?: number; required?: number }
    | { type: "FILE_TOO_LARGE"; size?: number; maxSize?: number };

// S3 errors
export type S3Error =
    | { type: "S3_UPLOAD_FAILED"; key: string; cause?: unknown }
    | { type: "S3_DOWNLOAD_FAILED"; key: string; cause?: unknown }
    | { type: "S3_DELETE_FAILED"; key: string; cause?: unknown }
    | { type: "S3_COPY_FAILED"; sourceKey: string; destKey: string; cause?: unknown }
    | { type: "S3_OBJECT_NOT_FOUND"; key: string };

// Unexpected
export type UnexpectedError = { type: "UNEXPECTED"; cause: unknown };

// Union of all FS errors
export type FSError = PermissionError | NotFoundError | ValidationError | StorageError | S3Error | UnexpectedError;

