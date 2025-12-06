"use client";

import useSWR from "swr";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { selectedLibraryItemsAtom } from "@/lib/store/lib-selector-store";

interface CountResponse {
    count: number;
}

const fetcher = async (url: string, folderIds: number[]) => {
    if (folderIds.length === 0) return { count: 0 };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderIds }),
    });

    if (!res.ok) throw new Error("Failed to fetch count");
    return res.json() as Promise<CountResponse>;
};

/**
 * Hook to get the count of files under the currently selected folders.
 * Uses SWR for caching and deduplication.
 */
export const useFolderCount = () => {
    const selectedItems = useAtomValue(selectedLibraryItemsAtom);

    const folderIds = useMemo(() => {
        return selectedItems
            .filter(item => item.folderId !== undefined)
            .map(item => item.folderId as number);
    }, [selectedItems]);

    const cacheKey = useMemo(() => {
        if (folderIds.length === 0) return null;
        return `count-${folderIds.sort().join(",")}`;
    }, [folderIds]);

    const { data, isLoading, error } = useSWR(
        cacheKey ? ["/api/fs/count", folderIds] : null,
        ([url, ids]) => fetcher(url, ids),
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000, // Cache for 30 seconds
        }
    );

    return {
        count: data?.count ?? 0,
        isLoading,
        error,
        hasSelection: folderIds.length > 0,
    };
};
