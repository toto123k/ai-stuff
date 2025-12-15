"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { DocumentAccordion } from "./document-accordion";
import { useRag } from "./rag-context";

export const SourceExplorer = () => {
    const { sidebarState, closeSidebar, setFilterQuery, results } = useRag();
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus filter input when sidebar opens
    useEffect(() => {
        if (sidebarState.isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [sidebarState.isOpen]);

    // Filter results based on query
    const filteredResults = sidebarState.filterQuery
        ? results.filter(
            (doc) =>
                doc.fileName
                    .toLowerCase()
                    .includes(sidebarState.filterQuery.toLowerCase()) ||
                doc.chunks.some((chunk) =>
                    chunk.chunkContent
                        .toLowerCase()
                        .includes(sidebarState.filterQuery.toLowerCase())
                )
        )
        : results;

    return (
        <Sheet open={sidebarState.isOpen} onOpenChange={(open) => !open && closeSidebar()}>
            <SheetContent
                side="left"
                dir="rtl"
                className="w-full sm:w-[25rem] sm:max-w-[25rem] p-0 flex flex-col h-full overflow-hidden"
            >
                <SheetHeader className="px-4 py-3 border-b shrink-0 w-full max-w-full overflow-hidden">
                    <div className="flex items-center justify-between w-full max-w-full">
                        <SheetTitle className="text-lg font-semibold truncate">
                            סייר מקורות
                        </SheetTitle>
                        <SheetClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shrink-0">
                            <X className="h-4 w-4" />
                            <span className="sr-only">סגור</span>
                        </SheetClose>
                    </div>
                    <SheetDescription className="sr-only">
                        סייר מסמכי מקור מתוצאות חיפוש RAG
                    </SheetDescription>

                    {/* Filter input */}
                    <div className="relative mt-2 w-full max-w-full">
                        <Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            ref={inputRef}
                            type="search"
                            placeholder="חיפוש מסמכים..."
                            className="pr-9 h-9 w-full"
                            value={sidebarState.filterQuery}
                            onChange={(e) => setFilterQuery(e.target.value)}
                        />
                    </div>
                </SheetHeader>

                <ScrollArea className="flex-1 w-full max-w-full overflow-hidden">
                    <div className="divide-y w-full max-w-full overflow-hidden">
                        {filteredResults.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
                                <p className="text-sm text-muted-foreground">
                                    {sidebarState.filterQuery
                                        ? "לא נמצאו מסמכים"
                                        : "אין תוצאות חיפוש"}
                                </p>
                            </div>
                        ) : (
                            filteredResults.map((doc) => (
                                <DocumentAccordion
                                    key={doc.documentId}
                                    document={doc}
                                    scrollTo={sidebarState.scrollToDocId === doc.documentId}
                                    className="w-full max-w-full overflow-hidden"
                                />
                            ))
                        )}
                    </div>
                </ScrollArea>

                {/* Footer with result count */}
                <div className="px-4 py-2 border-t text-xs text-muted-foreground shrink-0">
                    {filteredResults.length} מתוך {results.length} מסמכים
                    {sidebarState.filterQuery && " (מסונן)"}
                </div>
            </SheetContent>
        </Sheet>
    );
};
