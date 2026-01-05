"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { TrashIcon, UserIcon, CheckIcon, CrownIcon, Link2Icon } from "lucide-react";
import { Permission, EditablePermission, PERMISSION_LABELS } from "./types";
import { PermissionSelect } from "./permission-select";

interface PermissionRowProps {
    permission: Permission;
    isMarkedForDelete: boolean;
    hasChanged: boolean;
    displayPerm: string;
    minPermLevel: number;
    onPermissionChange: (userId: string, perm: EditablePermission, isInherited: boolean) => void;
    onToggleDelete: (userId: string) => void;
}

export const PermissionRow = ({
    permission: p, isMarkedForDelete, hasChanged, displayPerm, minPermLevel,
    onPermissionChange, onToggleDelete
}: PermissionRowProps) => {
    const isOwner = p.permission === "owner";
    const isInherited = !p.isDirect;
    const canEdit = !isOwner;
    const canDelete = p.isDirect && !isOwner;

    const rowClass = isMarkedForDelete
        ? "bg-destructive/10 opacity-60"
        : hasChanged ? "bg-primary/5" : "";

    const UserIconComponent = isOwner ? CrownIcon : isInherited ? Link2Icon : UserIcon;
    const iconClass = isOwner ? "text-yellow-600" : isInherited ? "text-muted-foreground" : "text-primary";

    return (
        <TableRow className={rowClass}>
            <TableCell>
                <div className="flex items-center gap-2">
                    <div className="bg-primary/10 p-1.5 rounded-full">
                        <UserIconComponent className={`h-3 w-3 ${iconClass}`} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm truncate font-mono" dir="ltr">{p.email}</span>
                        {isInherited && <span className="text-xs text-muted-foreground">ירושה מ: {p.folderName}</span>}
                    </div>
                </div>
            </TableCell>
            <TableCell>
                {isOwner ? (
                    <Badge variant="outline" className="text-yellow-600">{PERMISSION_LABELS.owner}</Badge>
                ) : canEdit ? (
                    <PermissionSelect
                        value={displayPerm}
                        onChange={(v) => onPermissionChange(p.userId, v, isInherited)}
                        disabled={isMarkedForDelete}
                        minPermLevel={minPermLevel}
                        inheritedFolderName={p.folderName}
                    />
                ) : null}
            </TableCell>
            <TableCell>
                {canDelete && (
                    <Button
                        variant={isMarkedForDelete ? "default" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onToggleDelete(p.userId)}
                    >
                        {isMarkedForDelete ? <CheckIcon className="h-4 w-4" /> : <TrashIcon className="h-4 w-4 text-destructive" />}
                    </Button>
                )}
            </TableCell>
        </TableRow>
    );
};
