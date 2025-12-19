"use client";

import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useMemo, useCallback } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { FSObject, FSObjectActions } from "../types";
import {
    activeRootTypeAtom,
    currentFolderIdAtom,
    isReadOnlyRootAtom,
    currentMutateKeyAtom,
    activeDialogAtom,
    DialogState,
    fsObjectStatesAtom,
} from "@/lib/store/library-store";

export function useFileOperations() {
    const activeRootType = useAtomValue(activeRootTypeAtom);
    const currentFolderId = useAtomValue(currentFolderIdAtom);
    const isReadOnlyRoot = useAtomValue(isReadOnlyRootAtom);
    const currentMutateKey = useAtomValue(currentMutateKeyAtom);
    const store = useStore();

    const setDialogState = useSetAtom(activeDialogAtom);
    const setFsObjectStates = useSetAtom(fsObjectStatesAtom);

    const refresh = useCallback(() => mutate(currentMutateKey), [currentMutateKey]);

    const openDialog = useCallback((type: DialogState["type"], targets: FSObject[] = []) => {
        setDialogState({ type, targets });
    }, [setDialogState]);

    const closeDialog = useCallback(() => {
        setDialogState(null);
    }, [setDialogState]);

    const handleCreateFolder = useCallback(async (name: string) => {
        if (isReadOnlyRoot) {
            toast.error("אין הרשאות ליצירת תיקייה כאן");
            return;
        }

        if (!name.trim()) {
            toast.error("אנא הזן שם לתיקייה");
            return;
        }

        try {
            const payload: Record<string, unknown> = {
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
            closeDialog();
            toast.success("התיקייה נוצרה בהצלחה");
        } catch (e) {
            toast.error("יצירת התיקייה נכשלה");
        }
    }, [isReadOnlyRoot, activeRootType, currentFolderId, refresh, closeDialog]);

    const handleRename = useCallback(async (name: string, target: FSObject | null) => {
        if (!target || !name.trim()) return;
        try {
            const endpoint =
                target.type === "folder"
                    ? `/api/fs/folders/${target.id}`
                    : `/api/fs/files/${target.id}`;

            const res = await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
            });

            if (!res.ok) throw new Error("Failed");
            refresh();
            closeDialog();
            toast.success("שינוי השם הצליח");
        } catch (e) {
            toast.error("שינוי השם נכשל");
        }
    }, [refresh, closeDialog]);

    const handleDelete = useCallback(async (targets: FSObject[]) => {
        if (targets.length === 0) return;
        try {
            // Delete all targets
            const deletePromises = targets.map((target) => {
                const endpoint =
                    target.type === "folder"
                        ? `/api/fs/folders/${target.id}`
                        : `/api/fs/files/${target.id}`;
                return fetch(endpoint, { method: "DELETE" });
            });

            const results = await Promise.all(deletePromises);
            const allOk = results.every((res) => res.ok);
            if (!allOk) throw new Error("Some deletions failed");

            refresh();
            closeDialog();
            toast.success(targets.length === 1 ? "המחיקה הצליחה" : `${targets.length} פריטים נמחקו`);
        } catch (e) {
            toast.error("המחיקה נכשלה");
        }
    }, [refresh, closeDialog]);

    const handlePaste = useCallback(async (targetFolder: FSObject | null) => {
        // Get the target folder ID - if null, use current folder
        const targetFolderId = targetFolder?.id ?? currentFolderId;
        if (targetFolderId === null) {
            toast.error("לא נבחרה תיקיית יעד");
            return;
        }

        // Get copied/cut items from state
        const states = store.get(fsObjectStatesAtom);
        const copiedIds: number[] = [];
        const cutIds: number[] = [];

        states.forEach((state, id) => {
            if (state.has("copy")) copiedIds.push(id);
            if (state.has("cut")) cutIds.push(id);
        });

        const isCut = cutIds.length > 0;
        const sourceIds = isCut ? cutIds : copiedIds;

        if (sourceIds.length === 0) {
            toast.error("אין פריטים להדבקה");
            return;
        }

        try {
            // Use move API for cut, copy API for copy
            const endpoint = isCut ? "/api/fs/move" : "/api/fs/copy";
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sourceIds, targetFolderId }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to paste");
            }

            const result = await res.json();
            const count = result.movedCount ?? result.copiedCount;

            // Clear copy/cut states after successful paste
            setFsObjectStates((prev) => {
                const next = new Map(prev);
                for (const id of sourceIds) {
                    const state = next.get(id);
                    if (state) {
                        const nextState = new Set(state);
                        nextState.delete("copy");
                        nextState.delete("cut");
                        if (nextState.size === 0) {
                            next.delete(id);
                        } else {
                            next.set(id, nextState);
                        }
                    }
                }
                return next;
            });

            refresh();
            toast.success(isCut ? `הועברו ${count} פריטים` : `הודבקו ${count} פריטים`);
        } catch (e) {
            console.error("Paste error:", e);
            toast.error("ההדבקה נכשלה");
        }
    }, [currentFolderId, store, setFsObjectStates, refresh]);

    const actions: FSObjectActions = useMemo(() => ({
        onRename: (obj: FSObject) => openDialog("rename", [obj]),
        onDelete: (obj: FSObject, allSelected: FSObject[]) => {
            // If clicked object is in the selected list, delete all selected
            // Otherwise, delete only the clicked object
            const targets = allSelected.some(s => s.id === obj.id)
                ? allSelected
                : [obj];
            openDialog("delete", targets);
        },
        onShare: (obj: FSObject) => openDialog("share", [obj]),
        onViewDetails: (obj: FSObject) => openDialog("metadata", [obj]),
        onPaste: (obj: FSObject | null) => handlePaste(obj),
    }), [openDialog, handlePaste]);

    return {
        handleCreateFolder,
        handleRename,
        handleDelete,
        openDialog,
        closeDialog,
        actions,
    };
}
