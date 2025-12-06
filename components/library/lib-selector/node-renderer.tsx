"use client";

import { INode } from "react-accessible-treeview";
import {
    ChevronRight,
    ChevronDown,
    Folder,
    FolderOpen,
    User,
    Building2,
    Share2,
    Loader2,
    Lock,
    File,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { RootCategory, TreeNodeMetadata } from "./types";

interface NodeRendererProps {
    element: INode<TreeNodeMetadata>;
    isBranch: boolean;
    isExpanded: boolean;
    isSelected: boolean;
    isHalfSelected: boolean;
    getNodeProps: any;
    level: number;
    handleSelect: (event: React.MouseEvent) => void;
    handleExpand: (event: React.MouseEvent) => void;
}

const ROOT_ICONS: Record<RootCategory, JSX.Element> = {
    personal: <User className="size-4 text-blue-500" />,
    organizational: <Building2 className="size-4 text-purple-500" />,
    shared: <Share2 className="size-4 text-green-500" />,
};

export const NodeRenderer = ({
    element,
    isBranch,
    isExpanded,
    isSelected,
    isHalfSelected,
    getNodeProps,
    level,
    handleExpand,
    handleSelect,
}: NodeRendererProps) => {
    const { isLoaded, isRootCategory, hasNoPermission, isFile, rootType, hasUnselectableChildren } = element.metadata || {};
    const isLoading = isExpanded && element.children.length === 0 && isBranch && !hasNoPermission && !isLoaded;

    return (
        <div
            {...getNodeProps()}
            onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                if (isBranch && !hasNoPermission) {
                    handleExpand(e);
                }
            }}
            className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors",
                hasNoPermission ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-accent hover:text-accent-foreground",
                isSelected && !hasNoPermission && "bg-accent text-accent-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            )}
            style={{ marginInlineStart: `${(level - 1) * 16}px` }}
        >
            {isBranch ? (
                hasNoPermission ? (
                    <Lock className="size-4 text-muted-foreground" />
                ) : (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleExpand(e); }}
                        className="flex items-center justify-center size-4 rounded hover:bg-muted"
                        aria-label={isExpanded ? "כווץ" : "הרחב"}
                    >
                        {isLoading ? (
                            <Loader2 className="size-4 text-muted-foreground animate-spin" />
                        ) : isExpanded ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                        )}
                    </button>
                )
            ) : (
                <span className="size-4" />
            )}

            <Checkbox
                checked={isSelected ? true : isHalfSelected ? "indeterminate" : false}
                disabled={hasNoPermission || hasUnselectableChildren}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!hasNoPermission && !hasUnselectableChildren) {
                        handleSelect(e);
                    }
                }}
                className={cn("mr-1", (hasNoPermission || hasUnselectableChildren) && "opacity-50")}
            />

            {isRootCategory && rootType ? (
                ROOT_ICONS[rootType]
            ) : isFile ? (
                <File className="size-4 text-blue-400" />
            ) : isBranch ? (
                isExpanded ? (
                    <FolderOpen className={cn("size-4", hasNoPermission ? "text-muted-foreground" : "text-amber-500")} />
                ) : (
                    <Folder className={cn("size-4", hasNoPermission ? "text-muted-foreground" : "text-amber-500")} />
                )
            ) : null}

            <span className={cn("text-sm font-medium truncate", hasNoPermission && "text-muted-foreground")}>
                {element.name}
            </span>
        </div>
    );
};
