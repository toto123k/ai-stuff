"use client";

import * as React from "react";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
    DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { LoaderIcon, TrashIcon, UserIcon } from "lucide-react";

type ShareDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    item: { id: number; name: string; type: "file" | "folder" } | null;
};

type Permission = {
    userId: string;
    email: string;
    permission: "read" | "write" | "admin";
};

export function ShareDialog({ isOpen, onClose, item }: ShareDialogProps) {
    const [targetUserId, setTargetUserId] = useState("");
    const [permission, setPermission] = useState<"read" | "write" | "admin">("read");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Only fetch permissions if item is a folder. 
    // NOTE: The current API /api/fs/permissions only supports folderId.
    // If we want to support file sharing, we need to update the API or use folderId of the file's parent?
    // Wait, the requirement says "share functionality if you press a file etc."
    // But the API route `GET` expects `folderId`. 
    // And `POST` expects `folderId`.
    // If I share a file, does it mean I share the file itself? The DB schema has `userPermissions` linked to `folderId` (which references `fsObjects.id`).
    // `fsObjects` contains both files and folders. So `folderId` in `userPermissions` is actually `objectId`.
    // I should probably rename it in my mind to `objectId` but the API expects `folderId`.
    // I will assume `folderId` in the API param means the ID of the object (file or folder).

    const { data: permissions, error, isLoading } = useSWR<Permission[]>(
        isOpen && item ? `/api/fs/permissions?folderId=${item.id}` : null,
        async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to fetch permissions");
            return res.json();
        }
    );

    const handleAddPermission = async () => {
        if (!item || !targetUserId) return;
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/fs/permissions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    targetUserId,
                    folderId: item.id,
                    permission,
                }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || "Failed to add permission");
            }

            toast.success("Permission added successfully");
            setTargetUserId("");
            mutate(`/api/fs/permissions?folderId=${item.id}`);
        } catch (e: any) {
            toast.error(e.message || "Failed to add permission");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose} >
            <DialogContent className="sm:max-w-md pt-10" dir="rtl">
                <DialogHeader>
                    <DialogTitle>שתף את {item?.name}</DialogTitle>
                    <DialogDescription>
                        הזן מזהה משתמש (UUID) כדי לשתף איתו את הפריט.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="flex items-end gap-2">
                        <div className="grid gap-1 flex-1">
                            <label className="text-sm font-medium">מזהה משתמש</label>
                            <Input
                                value={targetUserId}
                                onChange={(e) => setTargetUserId(e.target.value)}
                                placeholder="00000000-0000-0000-0000-000000000000"
                                className="text-left" // UUIDs are LTR
                                dir="ltr"
                            />
                        </div>
                        <div className="grid gap-1 w-[100px]">
                            <label className="text-sm font-medium">הרשאה</label>
                            <Select value={permission} onValueChange={(v: any) => setPermission(v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="read">צפייה</SelectItem>
                                    <SelectItem value="write">עריכה</SelectItem>
                                    <SelectItem value="admin">ניהול</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleAddPermission} disabled={isSubmitting || !targetUserId}>
                            {isSubmitting ? <LoaderIcon className="animate-spin w-4 h-4" /> : "הוסף"}
                        </Button>
                    </div>

                    <div className="border rounded-md">
                        <div className="p-2 bg-muted/50 border-b text-sm font-medium">
                            משתמשים עם גישה
                        </div>
                        <div className="max-h-[200px] overflow-y-auto p-2 space-y-2">
                            {isLoading ? (
                                <div className="flex justify-center p-4">
                                    <LoaderIcon className="animate-spin w-4 h-4 text-muted-foreground" />
                                </div>
                            ) : permissions?.length === 0 ? (
                                <div className="text-center text-sm text-muted-foreground p-4">
                                    אין משתמשים נוספים עם גישה
                                </div>
                            ) : (
                                permissions?.map((p) => (
                                    <div key={p.userId} className="flex items-center justify-between text-sm p-2 hover:bg-muted/50 rounded-md">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <div className="bg-primary/10 p-1.5 rounded-full">
                                                <UserIcon className="w-3 h-3 text-primary" />
                                            </div>
                                            <span className="truncate font-mono text-xs" dir="ltr">{p.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-muted-foreground text-xs">
                                                {p.permission === 'read' ? 'צפייה' : p.permission === 'write' ? 'עריכה' : 'ניהול'}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="sm:justify-start">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        סגור
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
