"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import { mutate } from "swr";
import { FSObject, FSObjectActions } from "../types";
import {
    activeRootTypeAtom,
    currentFolderIdAtom,
    isReadOnlyRootAtom,
    currentMutateKeyAtom,
    isCreateFolderOpenAtom,
    isRenameOpenAtom,
    isDeleteOpenAtom,
    isShareOpenAtom,
    isMetadataOpenAtom,
    selectedObjectAtom,
} from "@/lib/store/library-store";

export function useFileOperations() {
    const activeRootType = useAtomValue(activeRootTypeAtom);
    const currentFolderId = useAtomValue(currentFolderIdAtom);
    const isReadOnlyRoot = useAtomValue(isReadOnlyRootAtom);
    const currentMutateKey = useAtomValue(currentMutateKeyAtom);

    const [isCreateFolderOpen, setIsCreateFolderOpen] = useAtom(isCreateFolderOpenAtom);
    const [isRenameOpen, setIsRenameOpen] = useAtom(isRenameOpenAtom);
    const [isDeleteOpen, setIsDeleteOpen] = useAtom(isDeleteOpenAtom);
    const [isShareOpen, setIsShareOpen] = useAtom(isShareOpenAtom);
    const [isMetadataOpen, setIsMetadataOpen] = useAtom(isMetadataOpenAtom);
    const [selectedObject, setSelectedObject] = useAtom(selectedObjectAtom);

    const refresh = () => mutate(currentMutateKey);

    const handleCreateFolder = async (name: string) => {
        if (isReadOnlyRoot) {
            toast.error("אין הרשאות ליצירת תיקייה כאן");
            return;
        }

        if (!name.trim()) {
            toast.error("אנא הזן שם לתיקייה");
            return;
        }

        try {
            const payload: any = {
                name: name.trim(),
                rootType: activeRootType,
            };

            if (currentFolderId !== null) {
                payload.parentId = currentFolderId;
            }

            const res = await fetch("/api/fs/folders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error(`Failed to create folder`);

            refresh();
            setIsCreateFolderOpen(false);
            toast.success("התיקייה נוצרה בהצלחה");
        } catch (e) {
            toast.error("יצירת התיקייה נכשלה");
        }
    };

    const handleRename = async (name: string) => {
        if (!selectedObject || !name.trim()) return;
        try {
            const endpoint =
                selectedObject.type === "folder"
                    ? `/api/fs/folders/${selectedObject.id}`
                    : `/api/fs/files/${selectedObject.id}`;

            const res = await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
            });

            if (!res.ok) throw new Error("Failed");
            refresh();
            setIsRenameOpen(false);
            toast.success("שינוי השם הצליח");
        } catch (e) {
            toast.error("שינוי השם נכשל");
        }
    };

    const handleDelete = async () => {
        if (!selectedObject) return;
        try {
            const endpoint =
                selectedObject.type === "folder"
                    ? `/api/fs/folders/${selectedObject.id}`
                    : `/api/fs/files/${selectedObject.id}`;

            const res = await fetch(endpoint, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed");
            refresh();
            setIsDeleteOpen(false);
            toast.success("המחיקה הצליחה");
        } catch (e) {
            toast.error("המחיקה נכשלה");
        }
    };

    const actions: FSObjectActions = {
        onRename: (obj) => {
            setSelectedObject(obj);
            setIsRenameOpen(true);
        },
        onDelete: (obj) => {
            setSelectedObject(obj);
            setIsDeleteOpen(true);
        },
        onShare: (obj) => {
            setSelectedObject(obj);
            setIsShareOpen(true);
        },
        onViewDetails: (obj) => {
            setSelectedObject(obj);
            setIsMetadataOpen(true);
        },
    };

    return {
        handleCreateFolder,
        handleRename,
        handleDelete,
        actions,
    };
}
