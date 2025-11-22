"use client";

import { LoaderIcon, UploadIcon, PlusIcon, BanIcon } from "lucide-react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FoldersGrid } from "./folders-grid";
import { FilesTable } from "./files-table";
import {
    isCreateFolderOpenAtom,
    isReadOnlyRootAtom,
} from "@/lib/store/library-store";
import { useLibraryData } from "./hooks/use-library-data";
import { useLibraryNavigation } from "./hooks/use-library-navigation";
import { useFileUpload } from "./hooks/use-file-upload";
import { useFileOperations } from "./hooks/use-file-operations";

export function LibraryContent() {
    const isReadOnlyRoot = useAtomValue(isReadOnlyRootAtom);
    const setIsCreateFolderOpen = useSetAtom(isCreateFolderOpenAtom);

    const { objects, isLoading } = useLibraryData();
    const { handleNavigate } = useLibraryNavigation();
    const { fileInputRef, onDrop, getRootProps, getInputProps, isDragActive } =
        useFileUpload();
    const { actions } = useFileOperations();

    const folders = objects?.filter((o) => o.type === "folder") || [];
    const files = objects?.filter((o) => o.type === "file") || [];

    return (
        <div className="flex flex-col h-full" {...getRootProps()}>
            <input {...getInputProps()} />
            <ContextMenu>
                <ContextMenuTrigger className="flex-1 p-6 overflow-y-auto">
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
                            <FilesTable
                                files={files}
                                actions={actions}
                                fileInputRef={fileInputRef}
                            />
                            {objects.length === 0 && (
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
                            <ContextMenuItem onClick={() => setIsCreateFolderOpen(true)}>
                                <PlusIcon className="w-4 h-4 ml-2" /> צור תיקייה חדשה
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
