// Shared permission types and constants
// This file should NOT import any server-side dependencies

import type { PermType } from "@/lib/db/schema";

// Permission levels for comparison - must match fs-queries.ts
export const PERM_LEVELS: Record<PermType, number> = {
    read: 1,
    write: 2,
    admin: 3,
    owner: 4,
};

// Hebrew labels for permissions
export const PERMISSION_LABELS: Record<PermType, string> = {
    read: "צפייה",
    write: "עריכה",
    admin: "ניהול",
    owner: "בעלים",
};

export type EditablePermission = Exclude<PermType, "owner">;

export const EDITABLE_PERMISSIONS: EditablePermission[] = ["read", "write", "admin"];
