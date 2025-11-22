import { atom } from "jotai";
import { FSObject } from "@/components/library/types";

export type RootType = "personal" | "organizational" | "shared";

// Navigation Atoms
export const activeRootTypeAtom = atom<RootType>("personal");
export const currentFolderIdAtom = atom<number | null>(null);
export const breadcrumbsAtom = atom<{ id: number | null; name: string }[]>([
    { id: null, name: "אישי" },
]);

// Derived Navigation Atoms
export const isReadOnlyRootAtom = atom((get) => {
    const currentFolderId = get(currentFolderIdAtom);
    const activeRootType = get(activeRootTypeAtom);
    return currentFolderId === null && activeRootType !== "personal";
});

export const currentMutateKeyAtom = atom((get) => {
    const currentFolderId = get(currentFolderIdAtom);
    const activeRootType = get(activeRootTypeAtom);

    return currentFolderId
        ? `/api/fs/folders/${currentFolderId}`
        : activeRootType === "personal"
            ? "/api/fs/personal"
            : activeRootType === "shared"
                ? "/api/fs/shared"
                : "/api/fs/org";
});

// Dialog State Atoms
export const isCreateFolderOpenAtom = atom(false);
export const isRenameOpenAtom = atom(false);
export const isDeleteOpenAtom = atom(false);
export const isShareOpenAtom = atom(false);
export const isMetadataOpenAtom = atom(false);

// Selection & Operation Atoms
export const selectedObjectAtom = atom<FSObject | null>(null);
