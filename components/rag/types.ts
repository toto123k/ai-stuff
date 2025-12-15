"use client";

import type {
    Chunk,
    DocumentSearchResult,
    RagToolResult,
} from "@/lib/ai/tools/rag-search";

// Rank tier for color coding
export type RankTier = "top" | "mid" | "lower";

// Extended types with computed ranks
export interface RankedChunk extends Chunk {
    rank: number;
    isExpanded: boolean;
    rating: "up" | "down" | null;
}

export interface RankedDocument extends Omit<DocumentSearchResult, "chunks"> {
    rank: number;
    isExpanded: boolean;
    rating: "up" | "down" | null;
    chunks: RankedChunk[];
}

// Sidebar state
export interface RagSidebarState {
    isOpen: boolean;
    openedFrom: "viewAll" | "cardClick" | null;
    expandedDocId: string | null;
    scrollToDocId: string | null;
    filterQuery: string;
}

// Compute local chunk ranks within each document
export const computeRankedResults = (
    results: DocumentSearchResult[]
): RankedDocument[] => {
    // Sort documents by score
    const sortedDocs = [...results].sort((a, b) => b.score - a.score);

    return sortedDocs.map((doc, docIndex) => {
        // Sort chunks by score descending
        const sortedChunks = [...doc.chunks].sort((a, b) => b.score - a.score);

        return {
            ...doc,
            rank: docIndex + 1,
            isExpanded: false,
            rating: null,
            chunks: sortedChunks.map((chunk, chunkIndex) => ({
                ...chunk,
                rank: chunkIndex + 1,
                isExpanded: false,
                rating: null,
            })),
        };
    });
};

// Get rank tier for color coding
export const getRankTier = (rank: number): RankTier => {
    if (rank <= 3) return "top";
    if (rank <= 10) return "mid";
    return "lower";
};

// Get tier colors
export const getTierColors = (
    tier: RankTier
): { bg: string; text: string } => {
    switch (tier) {
        case "top":
            return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300" };
        case "mid":
            return { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-800 dark:text-yellow-300" };
        case "lower":
            return { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400" };
    }
};

// Get file icon based on MIME type
export const getFileIconName = (mimeType: string | undefined): string => {
    console.log("mimeType", mimeType);
    if (!mimeType) return "File";
    if (mimeType.includes("pdf")) return "FileText";
    if (mimeType.includes("word") || mimeType.includes("document")) return "FileText";
    if (mimeType.includes("sheet") || mimeType.includes("excel")) return "FileSpreadsheet";
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "FileSliders";
    if (mimeType.includes("image")) return "FileImage";
    if (mimeType.includes("json")) return "FileJson";
    if (mimeType.includes("javascript") || mimeType.includes("typescript")) return "FileCode";
    if (mimeType.includes("text")) return "FileText";
    return "File";
};

// Get file icon color based on MIME type
export const getFileIconColor = (mimeType: string | undefined): string => {
    if (!mimeType) return "text-muted-foreground";
    if (mimeType.includes("pdf")) return "text-red-600 dark:text-red-400";
    if (mimeType.includes("word") || mimeType.includes("document")) return "text-blue-600 dark:text-blue-400";
    if (mimeType.includes("sheet") || mimeType.includes("excel")) return "text-emerald-600 dark:text-emerald-400";
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "text-orange-600 dark:text-orange-400";
    if (mimeType.includes("image")) return "text-purple-600 dark:text-purple-400";
    if (mimeType.includes("json")) return "text-amber-600 dark:text-amber-400";
    if (mimeType.includes("javascript") || mimeType.includes("typescript")) return "text-cyan-600 dark:text-cyan-400";
    if (mimeType.includes("text")) return "text-slate-600 dark:text-slate-400";
    return "text-muted-foreground";
};

// Highlight query terms in text
export const highlightQueryTerms = (
    text: string,
    query: string
): Array<{ text: string; highlighted: boolean }> => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
        return [{ text, highlighted: false }];
    }

    const result: Array<{ text: string; highlighted: boolean }> = [];
    let remaining = text;

    while (remaining.length > 0) {
        const index = remaining.toLowerCase().indexOf(trimmedQuery);

        if (index === -1) {
            result.push({ text: remaining, highlighted: false });
            break;
        }

        if (index > 0) {
            result.push({ text: remaining.slice(0, index), highlighted: false });
        }

        result.push({
            text: remaining.slice(index, index + trimmedQuery.length),
            highlighted: true,
        });

        remaining = remaining.slice(index + trimmedQuery.length);
    }

    return result;
};

// Detect text direction based on first significant characters
export const detectTextDirection = (text: string): "rtl" | "ltr" => {
    // Hebrew: \u0590-\u05FF, Arabic: \u0600-\u06FF
    const rtlPattern = /[\u0590-\u05FF\u0600-\u06FF]/;
    const ltrPattern = /[A-Za-z]/;

    // Check first 100 characters for direction
    const sample = text.slice(0, 100);
    const rtlMatch = sample.match(rtlPattern);
    const ltrMatch = sample.match(ltrPattern);

    if (rtlMatch && (!ltrMatch || sample.indexOf(rtlMatch[0]) < sample.indexOf(ltrMatch[0]))) {
        return "rtl";
    }
    return "ltr";
};

// Re-export types from rag-search
export type { Chunk, DocumentSearchResult, RagToolResult };
