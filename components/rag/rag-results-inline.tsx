"use client";

import {
    ChevronLeft,
    File,
    FileCode,
    FileImage,
    FileJson,
    FileSliders,
    FileSpreadsheet,
    FileText,
} from "lucide-react";
import { memo, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRag } from "./rag-context";
import {
    getFileIconName,
    getRankTier,
    getTierColors,
    type RankedDocument,
} from "./types";

// Icon map
const iconMap = {
    File,
    FileText,
    FileCode,
    FileJson,
    FileImage,
    FileSpreadsheet,
    FileSliders,
} as const;

// Rank badge colors for top 3 (gold, silver, bronze style)
const getRankBadgeStyle = (rank: number) => {
    switch (rank) {
        case 1:
            return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700";
        case 2:
            return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600";
        case 3:
            return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 ring-1 ring-orange-300 dark:ring-orange-700";
        default:
            return getTierColors(getRankTier(rank)).bg + " " + getTierColors(getRankTier(rank)).text;
    }
};

interface ResultCardProps extends ComponentProps<"button"> {
    document: RankedDocument;
}

const ResultCard = memo(({ document, className, ...props }: ResultCardProps) => {
    const iconName = getFileIconName(document.fileType);
    const FileIcon = iconMap[iconName as keyof typeof iconMap] || File;

    // Get first chunk's content as snippet
    const snippet =
        document.chunks[0]?.chunkContent.slice(0, 150).trim() + "..." || "";

    return (
        <button
            type="button"
            className={cn(
                "group flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-right transition-all hover:shadow-md hover:border-primary/30",
                className
            )}
            {...props}
        >
            {/* Rank badge */}
            <span
                className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    getRankBadgeStyle(document.rank)
                )}
            >
                {document.rank}
            </span>

            {/* Separator */}
            <div className="h-12 w-px bg-border shrink-0 self-center" />

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                    <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-semibold text-base truncate">
                        {document.fileName}
                    </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{snippet}</p>
            </div>
        </button>
    );
});

ResultCard.displayName = "ResultCard";

interface RagResultsInlineProps extends ComponentProps<"div"> {
    maxVisible?: number;
}

const PureRagResultsInline = ({
    maxVisible = 3,
    className,
    ...props
}: RagResultsInlineProps) => {
    const { results, openSidebar } = useRag();

    if (results.length === 0) {
        return null;
    }

    const visibleResults = results.slice(0, maxVisible);
    const remainingCount = results.length - maxVisible;

    return (
        <div className={cn("space-y-3", className)} {...props}>
            {/* Result cards */}
            <div className="space-y-2">
                {visibleResults.map((doc) => (
                    <ResultCard
                        key={doc.documentId}
                        document={doc}
                        onClick={() => openSidebar(doc.documentId)}
                        aria-label={`הצג ${doc.fileName}, דירוג ${doc.rank}`}
                    />
                ))}
            </div>

            {/* Overflow footer */}
            {remainingCount > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-dashed px-4 py-2 text-sm">
                    <span className="text-muted-foreground">
                        מציג {maxVisible} מתוך {results.length} התוצאות המובילות.
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary"
                        onClick={() => openSidebar()}
                    >
                        הצג את כל המקורות
                        <ChevronLeft className="mr-1 h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    );
};

export const RagResultsInline = memo(PureRagResultsInline);

