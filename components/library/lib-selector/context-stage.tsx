"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FolderSearch, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LibTreeView } from "./lib-tree-view";
import { useFolderCount } from "./use-folder-count";

export interface ContextStageProps {
    className?: string;
    isVisible: boolean;
    onCollapse?: () => void;
}

/**
 * Context Stage - Expanded view shown above chat input when chat is empty.
 * Displays full tree selection panel for choosing RAG sources.
 */
export const ContextStage = ({ className, isVisible, onCollapse }: ContextStageProps) => {
    const { count, isLoading, hasSelection } = useFolderCount();
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, []);

    return (
        <AnimatePresence mode="wait">
            {isVisible && (
                <motion.div
                    ref={containerRef}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className={cn(
                        "overflow-hidden rounded-xl border border-border bg-card/50 backdrop-blur-sm",
                        className
                    )}
                >
                    <div className="max-h-[40vh] overflow-y-auto" dir="rtl">
                        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-card/80 px-4 py-3 backdrop-blur-sm">
                            <FolderSearch className="size-4 text-amber-500" />
                            <h3 className="font-medium text-sm">בחר מקורות לחיפוש</h3>
                            {hasSelection && (
                                <span className="mr-auto flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-primary text-xs">
                                    {isLoading ? (
                                        <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                        <>מתשאל {count} מסמכים</>
                                    )}
                                </span>
                            )}
                        </div>

                        <div className="p-3">
                            <LibTreeView className="space-y-0.5" />
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
