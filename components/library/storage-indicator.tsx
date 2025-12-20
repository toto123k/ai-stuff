"use client";

import useSWR from "swr";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { HardDrive } from "lucide-react";

import { RootType } from "@/lib/store/library-store";

interface StorageData {
    rootId: number;
    rootName: string;
    rootType: string;
    usedBytes: number;
    maxBytes: number;
    remainingBytes: number;
    usagePercent: number;
}

const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error("Failed to fetch storage info");
    return res.json();
});

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const getIndicatorColor = (percent: number): string => {
    if (percent < 50) return "bg-green-500";
    if (percent < 75) return "bg-blue-500";
    return "bg-red-500";
};

interface StorageIndicatorProps {
    rootId: number | null;
    className?: string;
    activeRootType: RootType;
}

export const StorageIndicator = ({ rootId, className, activeRootType }: StorageIndicatorProps) => {
    const { data, isLoading, error } = useSWR<StorageData>(
        rootId ? `/api/fs/storage?folderId=${rootId}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000, // Cache for 30 seconds
        }
    );

    // Don't show if no folder selected or loading
    if (!rootId || isLoading || error || !data) {
        return null;
    }

    const { usedBytes: rawUsed, maxBytes: rawMax, rootName } = data;
    const usedBytes = Number(rawUsed);
    const maxBytes = Number(rawMax);

    // Calculate percent on client for precision
    const percent = maxBytes > 0 ? (usedBytes / maxBytes) * 100 : 0;

    const getLabel = () => {
        if (activeRootType === "personal") return "אחסון בספרייה האישית שלי";
        if (activeRootType === "personal-temporary") return "אחסון בספרייה הזמנית שלי";
        return `אחסון ב${rootName}`;
    };

    return (
        <div className={cn("flex items-center gap-3 text-sm", className)}>
            <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col gap-1.5 w-[100%]">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{getLabel()}</span>
                    <span dir="ltr" className="shrink-0 mr-2">{formatBytes(usedBytes)} / {formatBytes(maxBytes)}</span>
                </div>
                <Progress
                    value={percent}
                    className="h-2 bg-secondary/10"
                    indicatorClassName={getIndicatorColor(percent)}
                />
            </div>
        </div>
    );
};

// Export SWR key for external mutation
export const getStorageKey = (rootId: number | null) =>
    rootId ? `/api/fs/storage?folderId=${rootId}` : null;
