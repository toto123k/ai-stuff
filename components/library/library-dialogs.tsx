"use client";

import { useAtom } from "jotai";
import {
    isCreateFolderOpenAtom,
    isRenameOpenAtom,
    isDeleteOpenAtom,
    isShareOpenAtom,
    isMetadataOpenAtom,
    selectedObjectAtom,
} from "@/lib/store/library-store";
import { useFileOperations } from "./hooks/use-file-operations";
import { CreateFolderDialog } from "./create-folder-dialog";
import { RenameDialog } from "./rename-dialog";
import { DeleteDialog } from "./delete-dialog";
import { ShareDialog } from "./share-dialog";
import { MetadataDialog } from "./metadata-dialog";

export function LibraryDialogs() {
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useAtom(isCreateFolderOpenAtom);
    const [isRenameOpen, setIsRenameOpen] = useAtom(isRenameOpenAtom);
    const [isDeleteOpen, setIsDeleteOpen] = useAtom(isDeleteOpenAtom);
    const [isShareOpen, setIsShareOpen] = useAtom(isShareOpenAtom);
    const [isMetadataOpen, setIsMetadataOpen] = useAtom(isMetadataOpenAtom);
    const [selectedObject] = useAtom(selectedObjectAtom);

    const { handleCreateFolder, handleRename, handleDelete } = useFileOperations();

    return (
        <>
            <CreateFolderDialog
                isOpen={isCreateFolderOpen}
                onOpenChange={setIsCreateFolderOpen}
                onSubmit={handleCreateFolder}
            />

            <RenameDialog
                isOpen={isRenameOpen}
                onOpenChange={setIsRenameOpen}
                onSubmit={handleRename}
                object={selectedObject}
            />

            <DeleteDialog
                isOpen={isDeleteOpen}
                onOpenChange={setIsDeleteOpen}
                onConfirm={handleDelete}
                object={selectedObject}
            />

            <ShareDialog
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
                item={selectedObject}
            />

            <MetadataDialog
                isOpen={isMetadataOpen}
                onOpenChange={setIsMetadataOpen}
                item={selectedObject}
            />
        </>
    );
}
