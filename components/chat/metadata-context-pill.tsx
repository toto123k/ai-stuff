"use client";

import { useAtomValue } from "jotai";
import { Sparkles, ChevronUp, ChevronDown, ExternalLink } from "lucide-react";
import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { chatMetadataAtom } from "@/lib/store/metadata-store";
import { DataViewer } from "@/components/ui/json-data-viewer";
import { Badge } from "@/components/ui/badge";

export function MetadataContextPill() {
    const metadata = useAtomValue(chatMetadataAtom);
    const keys = Object.keys(metadata);
    const [isExpanded, setIsExpanded] = useState(false);

    // Get unique origins
    const origins = useMemo(() => {
        const originSet = new Set<string>();
        keys.forEach(key => {
            const origin = metadata[key].origin;
            if (origin && origin !== "null") {
                try {
                    const url = new URL(origin);
                    originSet.add(url.hostname);
                } catch {
                    originSet.add(origin);
                }
            }
        });
        return Array.from(originSet);
    }, [keys, metadata]);

    if (keys.length === 0) {
        return null;
    }

    const originDisplay = origins.length > 0
        ? origins.join(", ")
        : "אתר חיצוני";

    return (
        <div className="w-full mb-2" dir="rtl">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-blue-500/40 bg-muted/50 backdrop-blur-sm overflow-hidden"
            >
                {/* Header / Trigger */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/70 transition-colors cursor-pointer"
                >
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-xs font-medium text-foreground/80">
                            מידע נטען מאתר חיצוני:
                        </span>
                        <span className="text-xs text-blue-500 flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            {originDisplay}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] h-5 font-normal">
                            {keys.length} פריטים
                        </Badge>
                        {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                    </div>
                </button>

                {/* Expandable Content */}
                <AnimatePresence initial={false}>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-border/30"
                        >
                            <div className="p-3 max-h-[350px] overflow-y-auto">
                                <div className="flex flex-col gap-3">
                                    {keys.map((key) => {
                                        const item = metadata[key];
                                        const displayMap = item.displayMap || {};
                                        const valueDisplayMap = item.valueDisplayMap || {};
                                        const displayName = displayMap[key] || key;

                                        return (
                                            <div
                                                key={key}
                                                className="rounded-lg border border-border/40 overflow-hidden bg-background/60"
                                            >
                                                {/* Section Header */}
                                                <div className="bg-muted/50 px-3 py-2 border-b border-border/30">
                                                    <span className="text-xs font-semibold text-foreground flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                        {displayName}
                                                    </span>
                                                </div>

                                                {/* Content */}
                                                <div className="p-2">
                                                    <DataViewer
                                                        data={item.value}
                                                        displayMap={displayMap}
                                                        valueDisplayMap={valueDisplayMap}
                                                        operatorMap={item.operatorMap}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
