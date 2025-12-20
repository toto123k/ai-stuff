"use client";

import { useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { useAtom, useAtomValue } from "jotai";
import {
    addUploadAtom,
    updateUploadProgressAtom,
    completeUploadAtom,
    failUploadAtom,
} from "@/lib/store/upload-store";
import {
    activeRootTypeAtom,
    currentFolderIdAtom,
    isReadOnlyRootAtom,
    currentMutateKeyAtom,
} from "@/lib/store/library-store";
import { mutate } from "swr";

export function useFileUpload() {
    const [, addUpload] = useAtom(addUploadAtom);
    const [, updateUploadProgress] = useAtom(updateUploadProgressAtom);
    const [, completeUpload] = useAtom(completeUploadAtom);
    const [, failUpload] = useAtom(failUploadAtom);

    const activeRootType = useAtomValue(activeRootTypeAtom);
    const currentFolderId = useAtomValue(currentFolderIdAtom);
    const isReadOnlyRoot = useAtomValue(isReadOnlyRootAtom);
    const currentMutateKey = useAtomValue(currentMutateKeyAtom);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            if (isReadOnlyRoot) {
                toast.error("לא ניתן להעלות קבצים לתיקיית שורש משותפת או ארגונית");
                return;
            }

            const newUploads = addUpload(acceptedFiles);

            for (const uploadItem of newUploads) {
                const file = uploadItem.file;
                const formData = new FormData();
                formData.append("file", file);

                if (currentFolderId !== null) {
                    formData.append("parentId", currentFolderId.toString());
                }

                formData.append("rootType", activeRootType);

                try {
                    updateUploadProgress({ id: uploadItem.id, progress: 10 });

                    const xhr = new XMLHttpRequest();
                    xhr.open("POST", "/api/fs/files");

                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            const percentComplete = (event.loaded / event.total) * 100;
                            updateUploadProgress({ id: uploadItem.id, progress: percentComplete });
                        }
                    };

                    xhr.onload = async () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            completeUpload(uploadItem.id);
                            toast.success(`העלאת ${file.name} הצליחה`);
                            mutate(currentMutateKey);
                        } else {
                            let errorMessage = `העלאת ${file.name} נכשלה`;
                            try {
                                const errorData = JSON.parse(xhr.responseText);
                                if (errorData.error) {
                                    errorMessage = errorData.error;
                                }
                            } catch {
                                // If parsing fails, use default message
                            }
                            failUpload({ id: uploadItem.id, error: errorMessage });
                            toast.error(errorMessage);
                        }
                    };

                    xhr.onerror = () => {
                        failUpload({ id: uploadItem.id, error: "Network Error" });
                        toast.error(`העלאת ${file.name} נכשלה`);
                    };

                    xhr.send(formData);
                } catch (e) {
                    console.error("Upload error:", e);
                    failUpload({ id: uploadItem.id, error: "Unknown Error" });
                    toast.error(`העלאת ${file.name} נכשלה`);
                }
            }
        },
        [
            currentFolderId,
            activeRootType,
            isReadOnlyRoot,
            addUpload,
            updateUploadProgress,
            completeUpload,
            failUpload,
            currentMutateKey,
        ]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        noClick: true,
        noKeyboard: true,
        disabled: isReadOnlyRoot,
    });

    return {
        fileInputRef,
        onDrop,
        getRootProps,
        getInputProps,
        isDragActive,
        isReadOnlyRoot,
    };
}
