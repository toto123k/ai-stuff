"use client";

import dynamic from "next/dynamic";
import { useAtom } from "jotai";
import { activeDialogAtom } from "@/lib/store/library-store";
import { useFileOperations } from "./hooks/use-file-operations";
import { CreateFolderDialog } from "./create-folder-dialog";
import { RenameDialog } from "./rename-dialog";
import { DeleteDialog } from "./delete-dialog";
import { ShareDialog } from "./share-dialog";
import { MetadataDialog } from "./metadata-dialog";
import { OverrideDialog } from "./override-dialog";
import { DocxPreviewDialog } from "./docx-preview-dialog";

// Dynamic import with SSR disabled to avoid DOMMatrix error
const PdfPreviewDialog = dynamic(
    () => import("./pdf-preview-dialog").then(mod => mod.PdfPreviewDialog),
    { ssr: false }
);

export function LibraryDialogs() {
    const [dialogState, setDialogState] = useAtom(activeDialogAtom);
    const { handleCreateFolder, handleRename, handleDelete, handleConfirmOverride } = useFileOperations();

    const closeDialog = () => setDialogState(null);

    // Get the first target for single-item dialogs
    const target = dialogState?.targets[0] ?? null;

    return (
        <>
            <CreateFolderDialog
                isOpen={dialogState?.type === "create-folder"}
                onOpenChange={(open) => !open && closeDialog()}
                onSubmit={handleCreateFolder}
            />

            <RenameDialog
                isOpen={dialogState?.type === "rename"}
                onOpenChange={(open) => !open && closeDialog()}
                onSubmit={(name) => handleRename(name, target)}
                object={target}
            />

            <DeleteDialog
                isOpen={dialogState?.type === "delete"}
                onOpenChange={(open) => !open && closeDialog()}
                onConfirm={() => handleDelete(dialogState?.targets ?? [])}
                targets={dialogState?.targets ?? []}
            />

            <ShareDialog
                isOpen={dialogState?.type === "share"}
                onClose={closeDialog}
                item={target}
            />

            <MetadataDialog
                isOpen={dialogState?.type === "metadata"}
                onOpenChange={(open) => !open && closeDialog()}
                item={target}
            />

            <OverrideDialog
                isOpen={dialogState?.type === "override"}
                onOpenChange={(open) => !open && closeDialog()}
                onConfirm={() => {
                    const meta = dialogState?.metadata;
                    if (meta?.operation && meta?.sourceIds && meta?.targetFolderId) {
                        handleConfirmOverride(meta.operation, meta.sourceIds, meta.targetFolderId);
                    }
                }}
                conflictName={dialogState?.metadata?.conflictName}
            />

            <DocxPreviewDialog
                isOpen={dialogState?.type === "preview"}
                onOpenChange={(open) => !open && closeDialog()}
                file={target}
            />

            <PdfPreviewDialog
                isOpen={dialogState?.type === "pdf-preview"}
                onOpenChange={(open) => !open && closeDialog()}
                file={target}
            />
        </>
    );
}

