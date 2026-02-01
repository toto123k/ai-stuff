"use client";

import TreeView, { INode, INodeRendererProps, flattenTree } from "react-accessible-treeview";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type DisplayMap = Record<string, string>;

interface DataViewerProps {
    data: any;
    displayMap?: DisplayMap;
    valueDisplayMap?: DisplayMap;
    className?: string;
}

interface NodeMetadata {
    type: "object" | "array" | "string" | "number" | "boolean" | "null";
    value?: any;
    path: string;
    displayLabel: string;
    displayValue?: string;
    [key: string]: any;
}

// Convert JSON data to tree structure
const jsonToTree = (
    data: any,
    displayMap?: DisplayMap,
    valueDisplayMap?: DisplayMap,
    parentPath = "",
    parentName = "root"
): { name: string; metadata: NodeMetadata; children?: any[] } => {
    const getDisplayLabel = (path: string, key: string) => displayMap?.[path] || key;
    const getDisplayValue = (path: string, value: any) => {
        const valueKey = `${path}:${value}`;
        return valueDisplayMap?.[valueKey] || String(value);
    };

    if (data === null) {
        return {
            name: parentName,
            metadata: { type: "null", path: parentPath, displayLabel: getDisplayLabel(parentPath, parentName), displayValue: "null" }
        };
    }

    if (Array.isArray(data)) {
        return {
            name: parentName,
            metadata: { type: "array", path: parentPath, displayLabel: getDisplayLabel(parentPath, parentName) },
            children: data.map((item, index) => {
                const childPath = parentPath ? `${parentPath}[${index}]` : `[${index}]`;
                return jsonToTree(item, displayMap, valueDisplayMap, childPath, `#${index + 1}`);
            })
        };
    }

    if (typeof data === "object") {
        const keys = Object.keys(data);
        return {
            name: parentName,
            metadata: { type: "object", path: parentPath, displayLabel: getDisplayLabel(parentPath, parentName) },
            children: keys.map((key) => {
                const childPath = parentPath ? `${parentPath}.${key}` : key;
                return jsonToTree(data[key], displayMap, valueDisplayMap, childPath, key);
            })
        };
    }

    // Primitives
    const type = typeof data as "string" | "number" | "boolean";
    return {
        name: parentName,
        metadata: {
            type,
            value: data,
            path: parentPath,
            displayLabel: getDisplayLabel(parentPath, parentName),
            displayValue: getDisplayValue(parentPath, data)
        }
    };
};

export function DataViewer({ data, displayMap, valueDisplayMap, className }: DataViewerProps) {
    // Build tree structure
    const tree = jsonToTree(data, displayMap, valueDisplayMap);

    // For root objects/arrays, use children directly
    const rootData = (tree.metadata.type === "object" || tree.metadata.type === "array") && tree.children
        ? { name: "", children: tree.children }
        : { name: "", children: [tree] };

    const flatData = flattenTree(rootData);

    return (
        <div className={cn("max-h-[280px] overflow-y-auto text-sm", className)} dir="rtl">
            <TreeView
                data={flatData as INode<NodeMetadata>[]}
                className="w-full"
                aria-label="תצוגת נתונים"
                defaultExpandedIds={flatData.filter(n => n.children?.length).map(n => n.id)}
                nodeRenderer={(props) => <DataNodeRenderer {...props} />}
            />
        </div>
    );
}

// Custom node renderer
const DataNodeRenderer = ({
    element,
    isBranch,
    isExpanded,
    getNodeProps,
    level,
    handleExpand,
}: INodeRendererProps) => {
    const meta = element.metadata as NodeMetadata;
    const indent = (level - 1) * 16;

    return (
        <div
            {...getNodeProps()}
            onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                if (isBranch) handleExpand(e);
            }}
            className={cn(
                "flex items-center gap-2 py-1 px-2 rounded transition-colors",
                isBranch ? "cursor-pointer hover:bg-muted/50" : "hover:bg-muted/30"
            )}
            style={{ paddingRight: indent + 8 }}
        >
            {/* Expand/Collapse arrow */}
            {isBranch ? (
                <button
                    onClick={(e) => { e.stopPropagation(); handleExpand(e); }}
                    className="flex items-center justify-center size-4 shrink-0"
                >
                    {isExpanded ? (
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                    ) : (
                        <ChevronLeft className="size-3.5 text-muted-foreground" />
                    )}
                </button>
            ) : (
                <span className="size-4 shrink-0" />
            )}

            {/* Label */}
            <span className={cn(
                "text-xs shrink-0",
                isBranch ? "text-blue-500 font-medium" : "text-muted-foreground"
            )}>
                {meta.displayLabel}
                {!isBranch && ":"}
            </span>

            {/* Value or count badge */}
            {isBranch ? (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-normal text-muted-foreground">
                    {element.children?.length || 0} {meta.type === "array" ? "פריטים" : "שדות"}
                </Badge>
            ) : (
                <ValueRenderer type={meta.type} value={meta.value} displayValue={meta.displayValue} />
            )}
        </div>
    );
};

// Value renderer with type styling
const ValueRenderer = ({ type, value, displayValue }: { type: string; value: any; displayValue?: string }) => {
    const display = displayValue || String(value);

    if (type === "null") {
        return <span className="text-xs text-muted-foreground/60 italic">null</span>;
    }

    if (type === "boolean") {
        return (
            <Badge
                variant="secondary"
                className={cn(
                    "text-[10px] h-5 font-normal",
                    value
                        ? "bg-green-500/20 text-green-600 dark:text-green-400"
                        : "bg-red-500/20 text-red-600 dark:text-red-400"
                )}
            >
                {display}
            </Badge>
        );
    }

    if (type === "number") {
        return <span className="text-xs text-orange-500">{display}</span>;
    }

    // String
    if (typeof value === "string" && (value.includes("@") || value.startsWith("http"))) {
        return <span className="text-xs text-blue-500 break-all">{display}</span>;
    }

    return <span className="text-xs text-foreground/80 break-all">{display}</span>;
};
