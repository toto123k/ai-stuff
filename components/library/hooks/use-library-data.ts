"use client";

import { useEffect } from "react";
import useSWR from "swr";
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

    const { data, error, isLoading, mutate } = useSWR<
        FSObject[] | { objects: FSObject[]; rootFolderId: number | null }
    >(currentMutateKey, async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
    });

    const objects = Array.isArray(data) ? data : data?.objects || [];
    const folders = objects.filter((o) => o.type === "folder");
    const files = objects.filter((o) => o.type === "file");

    useEffect(() => {
        if (
            (activeRootType === "personal" || activeRootType === "personal-temporary") &&
            !Array.isArray(data) &&
            data?.rootFolderId &&
            currentFolderId === null
        ) {
            setCurrentFolderId(data.rootFolderId);
            setBreadcrumbs([{
                id: data.rootFolderId,
                name: activeRootType === "personal" ? "אישי" : "זמניים"
            }]);
        }
    }, [data, activeRootType, currentFolderId, setCurrentFolderId, setBreadcrumbs]);

    const refresh = () => mutate();

    return {
        folders,
        files,
        isLoading,
        error,
        refresh,
    };
}
