"use client";

import { LoaderIcon, UploadIcon, PlusIcon, BanIcon, ClipboardPasteIcon } from "lucide-react";
import { useAtomValue } from "jotai";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FoldersGrid } from "./folders-grid";
import { FilesTable } from "./files-table";
import {
    isReadOnlyRootAtom,
    canPasteAtom,
    fsObjectStatesAtom,
} from "@/lib/store/library-store";
import { useSetAtom } from "jotai";
import { useLibraryData } from "./hooks/use-library-data";
import { useLibraryNavigation } from "./hooks/use-library-navigation";
import { useFileUpload } from "./hooks/use-file-upload";
import { useFileOperations } from "./hooks/use-file-operations";
import { useFileShortcuts } from "./hooks/use-file-shortcuts";

export function LibraryContent() {
    const isReadOnlyRoot = useAtomValue(isReadOnlyRootAtom);

    const { folders, files, isLoading } = useLibraryData();
    const { handleNavigate } = useLibraryNavigation();
    const { fileInputRef, onDrop, getRootProps, getInputProps, isDragActive } =
        useFileUpload();
    const { actions, openDialog } = useFileOperations([...folders, ...files]);

    useFileShortcuts([...folders, ...files], actions);

    const canPaste = useAtomValue(canPasteAtom);
    const setStates = useSetAtom(fsObjectStatesAtom);

    const handleBackgroundClick = (e: React.MouseEvent) => {
        // Don't deselect if clicking on interactive elements that haven't stopped propagation
        // mostly handled by stopPropagation in children, but good to keep in mind

        setStates((prev) => {
            const next = new Map(prev);
            let hasChanges = false;

            for (const [id, state] of next.entries()) {
                if (state.has("selected")) {
                    const nextState = new Set(state);
                    nextState.delete("selected");
                    if (nextState.size === 0) {
                        next.delete(id);
                    } else {
                        next.set(id, nextState);
                    }
                    hasChanges = true;
                }
            }

            return hasChanges ? next : prev;
        });
    };

    return (
        <div className="flex flex-col h-full" {...getRootProps()}>
            <input {...getInputProps()} />
            <ContextMenu>
                <ContextMenuTrigger
                    className="flex-1 p-6 overflow-y-auto"
                    onClick={handleBackgroundClick}
                >
                    {isDragActive && !isReadOnlyRoot && (
                        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary z-50 flex items-center justify-center backdrop-blur-sm">
                            <div className="text-xl font-medium text-primary">
                                גרור קבצים כדי להעלות
                            </div>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex items-center justify-center h-full w-full">
                            <LoaderIcon className="animate-spin w-6 h-6 text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in duration-500">
                            <FoldersGrid
                                folders={folders}
                                onNavigate={handleNavigate}
                                actions={actions}
                            />
                            <FilesTable.Root
                                files={files}
                                actions={actions}
                                fileInputRef={fileInputRef}
                            >
                                <FilesTable.Count className="mb-4" />
                                <FilesTable.Container>
                                    <FilesTable.Header />
                                    <FilesTable.Body />
                                </FilesTable.Container>
                            </FilesTable.Root>
                            {folders.length === 0 && (
                                <div className="text-center text-muted-foreground mt-20">
                                    אין פריטים להצגה
                                </div>
                            )}
                        </div>
                    )}
                </ContextMenuTrigger>

                <ContextMenuContent>
                    {!isReadOnlyRoot ? (
                        <>
                            <ContextMenuItem onClick={() => fileInputRef.current?.click()}>
                                <UploadIcon className="w-4 h-4 ml-2" /> העלה קובץ
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => openDialog("create-folder")}>
                                <PlusIcon className="w-4 h-4 ml-2" /> צור תיקייה חדשה
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => actions.onPaste(null)} disabled={!canPaste}>
                                <ClipboardPasteIcon className="w-4 h-4 ml-2" /> הדבק
                            </ContextMenuItem>
                        </>
                    ) : (
                        <ContextMenuItem disabled className="text-muted-foreground">
                            <BanIcon className="w-4 h-4 ml-2" />
                            אין אפשרות להוסיף קבצים כאן
                        </ContextMenuItem>
                    )}
                </ContextMenuContent>
            </ContextMenu>

            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        onDrop(Array.from(e.target.files));
                        e.target.value = "";
                    }
                }}
            />
        </div>
    );
}
