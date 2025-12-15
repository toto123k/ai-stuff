"use client";

import {
    ChevronDown,
    ExternalLink,
    File,
    FileCode,
    FileImage,
    FileJson,
    FileSliders,
    FileSpreadsheet,
    FileText,
    ThumbsDown,
    ThumbsUp,
} from "lucide-react";
import { memo, useEffect, useRef, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChunkCard } from "./chunk-card";
import { useRag } from "./rag-context";
import {
    getFileIconColor,
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

interface DocumentAccordionProps extends ComponentProps<"div"> {
    document: RankedDocument;
    scrollTo?: boolean;
}

const PureDocumentAccordion = ({
    document,
    scrollTo = false,
    className,
    ...props
}: DocumentAccordionProps) => {
    const { sidebarState, toggleDocExpanded, setDocRating, openFile } = useRag();
    const [showThanks, setShowThanks] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const tier = getRankTier(document.rank);
    const colors = getTierColors(tier);
    const iconName = getFileIconName(document.fileType);
    const iconColor = getFileIconColor(document.fileType);
    const FileIcon = iconMap[iconName as keyof typeof iconMap] || File;

    // Scroll into view when requested
    useEffect(() => {
        if (scrollTo && ref.current) {
            ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [scrollTo]);

    const handleRating = (rating: "up" | "down") => {
        const newRating = document.rating === rating ? null : rating;
        setDocRating(document.documentId, newRating);
        if (newRating) {
            setShowThanks(true);
            setTimeout(() => setShowThanks(false), 1000);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Filter chunks based on sidebar filter query
    const filteredChunks = sidebarState.filterQuery
        ? document.chunks.filter((chunk) =>
            chunk.chunkContent
                .toLowerCase()
                .includes(sidebarState.filterQuery.toLowerCase())
        )
        : document.chunks;

    return (
        <div
            ref={ref}
            className={cn("border-b last:border-b-0", className)}
            style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}
            {...props}
        >
            <Collapsible open={document.isExpanded}>
                <CollapsibleTrigger
                    className="grid w-full items-center gap-2 p-3 hover:bg-accent/50 transition-colors"
                    style={{
                        gridTemplateColumns: "auto 1fr auto auto auto auto",
                        maxWidth: "100%",
                    }}
                    onClick={() => toggleDocExpanded(document.documentId)}
                    aria-expanded={document.isExpanded}
                    aria-controls={`doc-content-${document.documentId}`}
                >
                    {/* Actions - fixed width */}
                    <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {showThanks && (
                            <span className="text-xs text-green-600 animate-in fade-in">
                                תודה על הדירוג
                            </span>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => openFile(document.documentId)}
                            aria-label="פתח קובץ"
                            title="פתח קובץ"
                        >
                            <ExternalLink className="h-3 w-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-6 w-6",
                                document.rating === "up" && "text-green-600 bg-green-100"
                            )}
                            onClick={() => handleRating("up")}
                            aria-label="אהבתי את המסמך"
                        >
                            <ThumbsUp className="h-3 w-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-6 w-6",
                                document.rating === "down" && "text-red-600 bg-red-100"
                            )}
                            onClick={() => handleRating("down")}
                            aria-label="לא אהבתי את המסמך"
                        >
                            <ThumbsDown className="h-3 w-3" />
                        </Button>
                    </div>

                    {/* File name and info - takes remaining space, truncates */}
                    <div className="min-w-0 text-right overflow-hidden">
                        <p className="font-medium text-sm truncate" title={document.fileName}>
                            {document.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                            {formatFileSize(document.size)} • {filteredChunks.length} קטעים
                        </p>
                    </div>

                    {/* File icon */}
                    <FileIcon className={cn("h-4 w-4", iconColor)} />

                    {/* Separator */}
                    <div className="h-4 w-px bg-border" />

                    {/* Rank badge */}
                    <span
                        className={cn(
                            "inline-flex items-center justify-center h-5 px-1.5 rounded text-xs font-medium",
                            colors.bg,
                            colors.text
                        )}
                    >
                        #{document.rank}
                    </span>

                    {/* Chevron */}
                    <ChevronDown
                        className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            document.isExpanded && "rotate-180"
                        )}
                    />
                </CollapsibleTrigger>

                <CollapsibleContent
                    id={`doc-content-${document.documentId}`}
                    className="px-3 pb-3"
                    style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}
                >
                    {filteredChunks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            לא נמצאו קטעים התואמים לסינון הנוכחי.
                        </p>
                    ) : (
                        <div className="rounded-xl bg-muted/30 p-3 flex flex-col gap-3">
                            {filteredChunks.map((chunk) => (
                                <ChunkCard
                                    key={chunk.chunkId}
                                    chunk={chunk}
                                    docId={document.documentId}
                                    filterQuery={sidebarState.filterQuery}
                                />
                            ))}
                        </div>
                    )}
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
};

export const DocumentAccordion = memo(PureDocumentAccordion);
