"use client";

import { useEffect } from "react";
import useSWR, { mutate } from "swr";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { FSObject } from "../types";
import {
    activeRootTypeAtom,
    currentFolderIdAtom,
    breadcrumbsAtom,
    currentMutateKeyAtom,
} from "@/lib/store/library-store";

export function useLibraryData() {
    const activeRootType = useAtomValue(activeRootTypeAtom);
    const [currentFolderId, setCurrentFolderId] = useAtom(currentFolderIdAtom);
    const setBreadcrumbs = useSetAtom(breadcrumbsAtom);
    const currentMutateKey = useAtomValue(currentMutateKeyAtom);

    const { data, error, isLoading } = useSWR<
        FSObject[] | { objects: FSObject[]; rootFolderId: number | null }
    >(currentMutateKey, async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
    });

    const objects = Array.isArray(data) ? data : data?.objects || [];

    useEffect(() => {
        if (
            activeRootType === "personal" &&
            !Array.isArray(data) &&
            data?.rootFolderId &&
            currentFolderId === null
        ) {
            setCurrentFolderId(data.rootFolderId);
            setBreadcrumbs([{ id: data.rootFolderId, name: "אישי" }]);
        }
    }, [data, activeRootType, currentFolderId, setCurrentFolderId, setBreadcrumbs]);

    const refresh = () => mutate(currentMutateKey);

    return {
        objects,
        isLoading,
        error,
        refresh,
    };
}
