"use client";

import { useState } from "react";
import { Folder, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { LibTreeView } from "./lib-tree-view";
import { useFolderCount } from "./use-folder-count";

export interface ContextChipProps {
    className?: string;
}

/**
 * Context Chip - Collapsed view shown inside input when chat has messages.
 * Shows document count with popover for editing selection.
 */
export const ContextChip = ({ className }: ContextChipProps) => {
    const { count, isLoading, hasSelection } = useFolderCount();
    const [isOpen, setIsOpen] = useState(false);



    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                        "h-7 gap-1.5 rounded-full border border-border/50 bg-muted/50 px-2.5 text-xs font-medium hover:bg-muted",
                        isOpen && "bg-muted",
                        className
                    )}
                >
                    <Folder className="size-3.5 text-amber-500" />
                    {isLoading ? (
                        <Loader2 className="size-3 animate-spin" />
                    ) : (
                        <span className="truncate">מתשאל {count} מסמכים</span>
                    )}
                    <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
            </PopoverTrigger>

            <PopoverContent
                align="end"
                side="top"
                className="w-80 p-0"
                sideOffset={8}
            >
                <div className="max-h-[50vh] overflow-y-auto" dir="rtl">
                    <div className="sticky top-0 z-10 border-b border-border/50 bg-popover px-3 py-2">
                        <h4 className="font-medium text-sm">עריכת מקורות</h4>
                    </div>

                    <div className="p-2">
                        <LibTreeView className="space-y-0.5" />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};
