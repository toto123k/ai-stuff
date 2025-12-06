"use client";

import { Check, Folder, File } from "lucide-react";
import { TreeNodeMetadata } from "./types";
import { cn } from "@/lib/utils";

interface SelectionCardProps {
    id: string;
    name: string;
    isSelected: boolean;
    isFile?: boolean;
    metadata?: TreeNodeMetadata;
    fileCount?: number;
    onClick: () => void;
}

export const SelectionCard = ({
    name,
    isSelected,
    isFile = false,
    fileCount,
    onClick,
}: SelectionCardProps) => {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 rounded-lg border-2 px-4 py-3 transition-all duration-200",
                "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background hover:border-muted-foreground/50"
            )}
        >
            <div className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md",
                isSelected ? "bg-primary/20" : "bg-muted"
            )}>
                {isFile ? (
                    <File className={cn("size-4", isSelected ? "text-primary" : "text-blue-400")} />
                ) : (
                    <Folder className={cn("size-4", isSelected ? "text-primary" : "text-amber-500")} />
                )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-start text-right">
                <span className={cn(
                    "truncate text-sm font-medium",
                    isSelected ? "text-primary" : "text-foreground"
                )}>
                    {name}
                </span>
                {typeof fileCount === "number" && (
                    <span className="text-xs text-muted-foreground">
                        {fileCount} קבצים
                    </span>
                )}
            </div>

            {isSelected && (
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" />
                </div>
            )}
        </button>
    );
};
