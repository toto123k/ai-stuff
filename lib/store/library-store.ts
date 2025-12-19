import { atom } from "jotai";
import { selectAtom } from "jotai/utils";
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

// Dialog State - combines dialog type and target object(s)
export type LibraryDialogType = "create-folder" | "rename" | "delete" | "share" | "metadata";
export interface DialogState {
    type: LibraryDialogType;
    targets: FSObject[]; // Object(s) the dialog operates on
}
export const activeDialogAtom = atom<DialogState | null>(null);

// File selection atoms
// File selection & state atoms
export type FSObjectState = "selected" | "copy" | "cut";
export const fsObjectStatesAtom = atom<Map<number, Set<FSObjectState>>>(new Map());
export const lastClickedFileIdAtom = atom<number | null>(null);

// Creates a stable derived atom for a specific file's state
// Derived atom to check if any file has "copy" or "cut" state
// This returns a boolean and only triggers updates when the boolean value changes
export const canPasteAtom = selectAtom(fsObjectStatesAtom, (states) => {
    for (const state of states.values()) {
        if (state.has("copy") || state.has("cut")) {
            return true;
        }
    }
    return false;
});

// Custom equality function for Set comparison
const setEquals = <T>(a: Set<T>, b: Set<T>): boolean => {
    if (a.size !== b.size) return false;
    for (const item of a) {
        if (!b.has(item)) return false;
    }
    return true;
};

export const createFSObjectStateAtom = (id: number) =>
    selectAtom(
        fsObjectStatesAtom,
        (states) => states.get(id) ?? new Set<FSObjectState>(),
        setEquals
    );
