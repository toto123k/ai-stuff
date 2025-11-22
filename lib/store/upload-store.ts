import { atom } from 'jotai';

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'error';

export interface UploadItem {
    id: string;
    file: File;
    progress: number;
    status: UploadStatus;
    error?: string;
}

export const uploadsAtom = atom<UploadItem[]>([]);
export const isUploadsOpenAtom = atom(false);

export const addUploadAtom = atom(
    null,
    (get, set, files: File[]) => {
        const newUploads = files.map((file) => ({
            id: Math.random().toString(36).substring(7),
            file,
            progress: 0,
            status: 'pending' as UploadStatus,
        }));
        set(uploadsAtom, (prev) => [...prev, ...newUploads]);
        set(isUploadsOpenAtom, true);
        return newUploads;
    }
);

export const updateUploadProgressAtom = atom(
    null,
    (get, set, { id, progress }: { id: string; progress: number }) => {
        set(uploadsAtom, (prev) =>
            prev.map((item) =>
                item.id === id ? { ...item, progress, status: 'uploading' } : item
            )
        );
    }
);

export const completeUploadAtom = atom(
    null,
    (get, set, id: string) => {
        set(uploadsAtom, (prev) =>
            prev.map((item) =>
                item.id === id ? { ...item, progress: 100, status: 'completed' } : item
            )
        );
    }
);

export const failUploadAtom = atom(
    null,
    (get, set, { id, error }: { id: string; error: string }) => {
        set(uploadsAtom, (prev) =>
            prev.map((item) =>
                item.id === id ? { ...item, status: 'error', error } : item
            )
        );
    }
);

export const removeUploadAtom = atom(
    null,
    (get, set, id: string) => {
        set(uploadsAtom, (prev) => prev.filter((item) => item.id !== id));
    }
);

export const clearCompletedAtom = atom(
    null,
    (get, set) => {
        set(uploadsAtom, (prev) => prev.filter((item) => item.status !== 'completed'));
    }
);
