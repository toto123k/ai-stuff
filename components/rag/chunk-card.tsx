"use client";

import { ChevronDown, Copy, ExternalLink, ThumbsDown, ThumbsUp } from "lucide-react";
import { memo, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useRag } from "./rag-context";
import {
    detectTextDirection,
    getRankTier,
    getTierColors,
    highlightQueryTerms,
    type RankedChunk,
} from "./types";

interface ChunkCardProps extends ComponentProps<"div"> {
    chunk: RankedChunk;
    docId: string;
    filterQuery?: string;
}

const PureChunkCard = ({
    chunk,
    docId,
    filterQuery = "",
    className,
    ...props
}: ChunkCardProps) => {
    const { toggleChunkExpanded, setChunkRating, openFileAtPage } = useRag();
    const [isHovered, setIsHovered] = useState(false);
    const [showThanks, setShowThanks] = useState(false);

    const tier = getRankTier(chunk.rank);
    const colors = getTierColors(tier);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(chunk.chunkContent);
    };

    const handleRating = (rating: "up" | "down") => {
        const newRating = chunk.rating === rating ? null : rating;
        setChunkRating(docId, chunk.chunkId, newRating);
        if (newRating) {
            setShowThanks(true);
            setTimeout(() => setShowThanks(false), 1000);
        }
    };

    const highlightedContent = highlightQueryTerms(chunk.chunkContent, filterQuery);
    const textDirection = detectTextDirection(chunk.chunkContent);

    return (
        <Card
            className={cn(
                "group relative transition-all duration-200 w-full max-w-full overflow-hidden border-0 shadow-none rounded-none",
                chunk.isExpanded ? "h-auto" : "h-36",
                isHovered && !chunk.isExpanded && "bg-accent/30",
                className
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            {...props}
        >
            <CardHeader
                className={cn(
                    "flex flex-row-reverse items-center justify-between px-3 py-2 transition-opacity w-full max-w-full",
                    !chunk.isExpanded && !isHovered && "opacity-60"
                )}
            >
                <div className="flex items-center gap-2 shrink-0">
                    {/* Rank badge */}
                    <span
                        className={cn(
                            "inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded text-xs font-medium",
                            colors.bg,
                            colors.text
                        )}
                    >
                        #{chunk.rank}
                    </span>
                    {chunk.pageId && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => openFileAtPage(docId, chunk.pageId!)}
                            title="פתח בעמוד זה"
                        >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            עמוד {chunk.pageId}
                        </Button>
                    )}
                </div>

                {/* Actions */}
                <div
                    className={cn(
                        "flex flex-row-reverse items-center gap-1 transition-opacity shrink-0",
                        !chunk.isExpanded && !isHovered && "opacity-0"
                    )}
                >
                    {showThanks && (
                        <span className="text-xs text-green-600 mr-2 animate-in fade-in slide-in-from-right-2">
                            תודה!
                        </span>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-6 w-6",
                            chunk.rating === "up" && "text-green-600 bg-green-100"
                        )}
                        onClick={() => handleRating("up")}
                        aria-label="אהבתי"
                    >
                        <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-6 w-6",
                            chunk.rating === "down" && "text-red-600 bg-red-100"
                        )}
                        onClick={() => handleRating("down")}
                        aria-label="לא אהבתי"
                    >
                        <ThumbsDown className="h-3.5 w-3.5" />
                    </Button>
                    {chunk.isExpanded && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={handleCopy}
                            aria-label="העתק"
                        >
                            <Copy className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="p-0">
                <button
                    type="button"
                    dir={textDirection}
                    className={cn(
                        "w-full max-w-full px-3 py-2 text-sm overflow-hidden break-words whitespace-pre-wrap",
                        textDirection === "rtl" ? "text-right" : "text-left",
                        !chunk.isExpanded && "line-clamp-3"
                    )}
                    style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                    onClick={() => toggleChunkExpanded(docId, chunk.chunkId)}
                    aria-expanded={chunk.isExpanded}
                >
                    {highlightedContent.map((part, i) =>
                        part.highlighted ? (
                            <mark
                                key={i}
                                className="bg-yellow-200 dark:bg-yellow-800/50 font-medium rounded px-0.5"
                            >
                                {part.text}
                            </mark>
                        ) : (
                            <span key={i}>{part.text}</span>
                        )
                    )}
                </button>

                {/* Fade gradient for truncated content */}
                {!chunk.isExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                )}

                {/* Expand indicator */}
                {chunk.isExpanded && (
                    <div className="flex justify-center pb-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-muted-foreground"
                            onClick={() => toggleChunkExpanded(docId, chunk.chunkId)}
                        >
                            <ChevronDown className="h-3 w-3 rotate-180 mr-1" />
                            כווץ
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export const ChunkCard = memo(PureChunkCard);
