// Re-export types from schema
export type { PermType } from "@/lib/db/schema";

// Re-export constants from shared lib (NOT from fs-queries to avoid server dependency)
export { PERM_LEVELS, PERMISSION_LABELS, EDITABLE_PERMISSIONS } from "@/lib/permissions";
export type { EditablePermission } from "@/lib/permissions";

// Component-specific types
export interface ShareDialogProps {
    isOpen: boolean;
    onClose: () => void;
    item: { id: number; name: string; type: "file" | "folder" } | null;
}

import type { PermType } from "@/lib/db/schema";

export interface Permission {
    userId: string;
    email: string;
    permission: PermType;
    folderId: number;
    folderName: string;
    isDirect: boolean;
    inheritedPermission: PermType | null;
}

export interface SearchUser {
    id: string;
    email: string;
}
