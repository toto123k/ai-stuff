"use client";

import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useMemo, useCallback, useRef } from "react";
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
    selectedIdsAtom,
} from "@/lib/store/library-store";

export function useFileOperations(files: FSObject[] = []) {
    const activeRootType = useAtomValue(activeRootTypeAtom);
    const currentFolderId = useAtomValue(currentFolderIdAtom);
    const isReadOnlyRoot = useAtomValue(isReadOnlyRootAtom);
    const currentMutateKey = useAtomValue(currentMutateKeyAtom);
    const store = useStore();

    const setDialogState = useSetAtom(activeDialogAtom);
    const setFsObjectStates = useSetAtom(fsObjectStatesAtom);

    // Use ref to hold current selection so actions don't re-create on selection change
    const filesRef = useRef(files);
    filesRef.current = files;

    // Function to get current selected objects (reads from ref, not closure)
    const getSelectedObjects = useCallback(() => {
        const currentSelectedIds = store.get(selectedIdsAtom);
        return filesRef.current.filter(f => currentSelectedIds.includes(f.id));
    }, [store]);

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

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to create folder");
            }

            refresh();
            closeDialog();
            toast.success("התיקייה נוצרה בהצלחה");
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "יצירת התיקייה נכשלה";
            toast.error(errorMessage);
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

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to rename");
            }
            refresh();
            closeDialog();
            toast.success("שינוי השם הצליח");
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "שינוי השם נכשל";
            toast.error(errorMessage);
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
            const failedResults = results.filter((res) => !res.ok);

            if (failedResults.length > 0) {
                const errorData = await failedResults[0].json();
                throw new Error(errorData.error || "Some deletions failed");
            }

            refresh();
            closeDialog();
            toast.success(targets.length === 1 ? "המחיקה הצליחה" : `${targets.length} פריטים נמחקו`);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "המחיקה נכשלה";
            toast.error(errorMessage);
        }
    }, [refresh, closeDialog]);

    const handlePaste = useCallback(async (targetFolder: FSObject | null, override: boolean = false) => {
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
                body: JSON.stringify({ sourceIds, targetFolderId, override }),
            });

            if (!res.ok) {
                const data = await res.json();

                // Handle conflict - show override dialog
                if (res.status === 409 && data.conflictName) {
                    setDialogState({
                        type: "override",
                        targets: [],
                        metadata: {
                            operation: isCut ? "move" : "copy",
                            sourceIds,
                            targetFolderId,
                            conflictName: data.conflictName,
                        },
                    });
                    return;
                }

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
            const errorMessage = e instanceof Error ? e.message : "ההדבקה נכשלה";
            toast.error(errorMessage);
        }
    }, [currentFolderId, store, setFsObjectStates, refresh, setDialogState]);

    const handleConfirmOverride = useCallback(async (
        operation: "copy" | "move",
        sourceIds: number[],
        targetFolderId: number
    ) => {
        try {
            const endpoint = operation === "move" ? "/api/fs/move" : "/api/fs/copy";
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sourceIds, targetFolderId, override: true }),
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

            closeDialog();
            refresh();
            toast.success(operation === "move" ? `הועברו ${count} פריטים` : `הודבקו ${count} פריטים`);
        } catch (e) {
            console.error("Override paste error:", e);
            const errorMessage = e instanceof Error ? e.message : "ההדבקה נכשלה";
            toast.error(errorMessage);
        }
    }, [setFsObjectStates, closeDialog, refresh]);

    const handleDownload = useCallback(async (targets: FSObject[]) => {
        if (targets.length === 0) return;

        try {
            const ids = targets.map(t => t.id);

            // Single file - use direct presigned URL for faster download
            if (targets.length === 1 && targets[0].type === "file") {
                const res = await fetch(`/api/fs/download?fileId=${ids[0]}&download=true`);
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to download");
                }
                const { url } = await res.json();
                window.location.href = url;
                toast.success("ההורדה החלה");
                return;
            }

            // Multiple items or folders - use batch endpoint for unified zip
            toast.info("מכין קובץ להורדה...");

            // Create a hidden form to POST and trigger download
            const link = document.createElement("a");

            // For batch download, we need to make a POST request that returns a file
            // Using fetch with blob response
            const res = await fetch("/api/fs/download/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to download");
            }

            // Get the zip as blob and download it
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);

            // Get filename from Content-Disposition header
            const contentDisposition = res.headers.get("Content-Disposition");
            let filename = "download.zip";
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+?)"/);
                if (match) {
                    filename = decodeURIComponent(match[1]);
                }
            }

            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
            toast.success("ההורדה הושלמה");
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "ההורדה נכשלה";
            toast.error(errorMessage);
        }
    }, []);

    const handleOpen = useCallback(async (obj: FSObject) => {
        if (obj.type !== "file") return;

        try {
            const res = await fetch(`/api/fs/download?fileId=${obj.id}`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to open file");
            }
            const { url } = await res.json();

            // Open in new tab
            window.open(url, "_blank");
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "פתיחת הקובץ נכשלה";
            toast.error(errorMessage);
        }
    }, []);

    const actions: FSObjectActions = useMemo(() => ({
        onRename: (obj: FSObject) => openDialog("rename", [obj]),
        onDelete: (obj: FSObject) => {
            // If clicked object is in the selected list, delete all selected
            // Otherwise, delete only the clicked object
            const selected = getSelectedObjects();
            const targets = selected.some(s => s.id === obj.id)
                ? selected
                : [obj];
            openDialog("delete", targets);
        },
        onShare: (obj: FSObject) => openDialog("share", [obj]),
        onViewDetails: (obj: FSObject) => openDialog("metadata", [obj]),
        onPaste: (obj: FSObject | null) => handlePaste(obj),
        onDownload: (obj: FSObject) => {
            // If clicked object is in the selected list, download all selected
            // Otherwise, download only the clicked object
            const selected = getSelectedObjects();
            const targets = selected.some(s => s.id === obj.id)
                ? selected
                : [obj];
            handleDownload(targets);
        },
        onOpen: (obj: FSObject) => handleOpen(obj),
    }), [openDialog, handlePaste, handleDownload, handleOpen, getSelectedObjects]);

    return {
        handleCreateFolder,
        handleRename,
        handleDelete,
        handleConfirmOverride,
        openDialog,
        closeDialog,
        actions,
    };
}
