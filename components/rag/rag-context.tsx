"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import type { RagSidebarState, RankedDocument } from "./types";

interface RagContextValue {
    // Sidebar state
    sidebarState: RagSidebarState;
    openSidebar: (docId?: string) => void;
    closeSidebar: () => void;
    setFilterQuery: (query: string) => void;

    // Results
    results: RankedDocument[];
    setResults: (results: RankedDocument[]) => void;

    // Document state
    toggleDocExpanded: (docId: string) => void;
    setDocRating: (docId: string, rating: "up" | "down" | null) => void;

    // Chunk state
    toggleChunkExpanded: (docId: string, chunkId: string) => void;
    setChunkRating: (docId: string, chunkId: string, rating: "up" | "down" | null) => void;

    // File opening
    openFile: (docId: string) => void;
    openFileAtPage: (docId: string, pageId: string) => void;
}

const RagContext = createContext<RagContextValue | null>(null);

export const useRag = () => {
    const context = useContext(RagContext);
    if (!context) {
        throw new Error("useRag must be used within a RagProvider");
    }
    return context;
};

interface RagProviderProps {
    children: ReactNode;
    initialResults?: RankedDocument[];
}

export const RagProvider = ({ children, initialResults = [] }: RagProviderProps) => {
    const [sidebarState, setSidebarState] = useState<RagSidebarState>({
        isOpen: false,
        openedFrom: null,
        expandedDocId: null,
        scrollToDocId: null,
        filterQuery: "",
    });

    const [results, setResults] = useState<RankedDocument[]>(initialResults);

    const openSidebar = useCallback((docId?: string) => {
        setSidebarState((prev) => ({
            ...prev,
            isOpen: true,
            openedFrom: docId ? "cardClick" : "viewAll",
            expandedDocId: docId ?? null,
            scrollToDocId: docId ?? null,
        }));

        // If opening with a specific doc, expand it
        if (docId) {
            setResults((prev) =>
                prev.map((doc) => ({
                    ...doc,
                    isExpanded: doc.documentId === docId,
                }))
            );
        }
    }, []);

    const closeSidebar = useCallback(() => {
        setSidebarState((prev) => ({
            ...prev,
            isOpen: false,
            openedFrom: null,
            scrollToDocId: null,
        }));
    }, []);

    const setFilterQuery = useCallback((query: string) => {
        setSidebarState((prev) => ({
            ...prev,
            filterQuery: query,
        }));
    }, []);

    const toggleDocExpanded = useCallback((docId: string) => {
        setResults((prev) =>
            prev.map((doc) =>
                doc.documentId === docId
                    ? { ...doc, isExpanded: !doc.isExpanded }
                    : doc
            )
        );
    }, []);

    const setDocRating = useCallback(
        (docId: string, rating: "up" | "down" | null) => {
            setResults((prev) =>
                prev.map((doc) =>
                    doc.documentId === docId ? { ...doc, rating } : doc
                )
            );
        },
        []
    );

    const toggleChunkExpanded = useCallback((docId: string, chunkId: string) => {
        setResults((prev) =>
            prev.map((doc) =>
                doc.documentId === docId
                    ? {
                        ...doc,
                        chunks: doc.chunks.map((chunk) =>
                            chunk.chunkId === chunkId
                                ? { ...chunk, isExpanded: !chunk.isExpanded }
                                : chunk
                        ),
                    }
                    : doc
            )
        );
    }, []);

    const setChunkRating = useCallback(
        (docId: string, chunkId: string, rating: "up" | "down" | null) => {
            setResults((prev) =>
                prev.map((doc) =>
                    doc.documentId === docId
                        ? {
                            ...doc,
                            chunks: doc.chunks.map((chunk) =>
                                chunk.chunkId === chunkId ? { ...chunk, rating } : chunk
                            ),
                        }
                        : doc
                )
            );
        },
        []
    );

    const openFile = useCallback((docId: string) => {
        const doc = results.find((d) => d.documentId === docId);
        if (doc?.sourcePath) {
            // Open file in a new tab using the API
            window.open(`/api/fs/view/${encodeURIComponent(doc.sourcePath)}`, "_blank");
        }
    }, [results]);

    const openFileAtPage = useCallback((docId: string, pageId: string) => {
        const doc = results.find((d) => d.documentId === docId);
        if (doc?.sourcePath) {
            // Open file at specific page (page parameter for PDF viewers)
            const url = `/api/fs/view/${encodeURIComponent(doc.sourcePath)}#page=${pageId}`;
            window.open(url, "_blank");
        }
    }, [results]);

    const value = useMemo<RagContextValue>(
        () => ({
            sidebarState,
            openSidebar,
            closeSidebar,
            setFilterQuery,
            results,
            setResults,
            toggleDocExpanded,
            setDocRating,
            toggleChunkExpanded,
            setChunkRating,
            openFile,
            openFileAtPage,
        }),
        [
            sidebarState,
            openSidebar,
            closeSidebar,
            setFilterQuery,
            results,
            toggleDocExpanded,
            setDocRating,
            toggleChunkExpanded,
            setChunkRating,
            openFile,
            openFileAtPage,
        ]
    );

    return <RagContext.Provider value={value}>{children}</RagContext.Provider>;
};
