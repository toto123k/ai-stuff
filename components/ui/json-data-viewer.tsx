"use client";

import TreeView, { INode, INodeRendererProps, flattenTree } from "react-accessible-treeview";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DisplayMap = Record<string, string>;

interface DataViewerProps {
    data: any;
    displayMap?: DisplayMap;
    valueDisplayMap?: DisplayMap;
    operatorMap?: Record<string, string>;
    className?: string;
}

interface NodeMetadata {
    type: "object" | "array" | "string" | "number" | "boolean" | "null";
    value?: any;
    path: string;
    displayLabel: string;
    displayValue?: string;
    operator?: string;
    [key: string]: any;
}

// Convert JSON data to tree structure
const jsonToTree = (
    data: any,
    displayMap?: DisplayMap,
    valueDisplayMap?: DisplayMap,
    operatorMap?: Record<string, string>,
    parentPath = "",
    parentName = "root"
): { name: string; metadata: NodeMetadata; children?: any[] } => {
    const getDisplayLabel = (path: string, key: string) => displayMap?.[path] || key;
    const getOperator = (path: string, key: string) => operatorMap?.[path] || (path === "" ? operatorMap?.[key] : undefined);
    const getDisplayValue = (path: string, value: any) => {
        const valueKey = `${path}:${value}`;
        return valueDisplayMap?.[valueKey] || String(value);
    };

    if (data === null) {
        return {
            name: parentName,
            metadata: { type: "null", path: parentPath, displayLabel: getDisplayLabel(parentPath, parentName), displayValue: "null", operator: getOperator(parentPath, parentName) }
        };
    }

    if (Array.isArray(data)) {
        return {
            name: parentName,
            metadata: { type: "array", path: parentPath, displayLabel: getDisplayLabel(parentPath, parentName), operator: getOperator(parentPath, parentName) },
            children: data.map((item, index) => {
                const childPath = parentPath ? `${parentPath}[${index}]` : `[${index}]`;
                return jsonToTree(item, displayMap, valueDisplayMap, operatorMap, childPath, `#${index + 1}`);
            })
        };
    }

    if (typeof data === "object") {
        const keys = Object.keys(data);
        return {
            name: parentName,
            metadata: { type: "object", path: parentPath, displayLabel: getDisplayLabel(parentPath, parentName), operator: getOperator(parentPath, parentName) },
            children: keys.map((key) => {
                const childPath = parentPath ? `${parentPath}.${key}` : key;
                return jsonToTree(data[key], displayMap, valueDisplayMap, operatorMap, childPath, key);
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
            displayValue: getDisplayValue(parentPath, data),
            operator: getOperator(parentPath, parentName)
        }
    };
};

export function DataViewer({ data, displayMap, valueDisplayMap, operatorMap, className }: DataViewerProps) {
    // Build tree structure
    const tree = jsonToTree(data, displayMap, valueDisplayMap, operatorMap);

    // For root objects/arrays, use children directly
    const rootData = (tree.metadata.type === "object" || tree.metadata.type === "array") && tree.children
        ? { name: "", children: tree.children }
        : { name: "", children: [tree] };

    const flatData = flattenTree(rootData);

    return (
        <TooltipProvider delayDuration={300}>
            <div className={cn("max-h-72 overflow-y-auto text-sm", className)} dir="rtl">
                <TreeView
                    data={flatData as INode<NodeMetadata>[]}
                    className="w-full"
                    aria-label="תצוגת נתונים"
                    defaultExpandedIds={flatData.filter(n => n.children?.length).map(n => n.id)}
                    nodeRenderer={(props) => <DataNodeRenderer {...props} />}
                />
            </div>
        </TooltipProvider>
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

            {/* Operator and Label */}
            <div className="flex items-center gap-1.5 shrink-0">
                {meta.operator && (
                    <OperatorBadge operator={meta.operator} />
                )}
                <span className={cn(
                    "text-xs",
                    isBranch ? "text-blue-500 font-medium" : "text-muted-foreground"
                )}>
                    {meta.displayLabel}
                    {!isBranch && ":"}
                </span>
            </div>

            {/* Value or count badge */}
            {isBranch ? (
                <Badge variant="outline" className="text-xs h-5 px-2 font-normal text-muted-foreground ml-auto">
                    {element.children?.length || 0} {meta.type === "array" ? "פריטים" : "שדות"}
                </Badge>
            ) : (
                <ValueRenderer type={meta.type} value={meta.value} displayValue={meta.displayValue} />
            )}
        </div>
    );
};

const getOperatorConfig = (operator: string) => {
    switch (operator) {
        case "equal": return { symbol: "=", label: "Equal", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" };
        case "not_equal": return { symbol: "≠", label: "Not equal", color: "text-red-500 bg-red-500/10 border-red-500/20" };
        case "greater_then": return { symbol: ">", label: "Greater then", color: "text-pink-500 bg-pink-500/10 border-pink-500/20" };
        case "greater_then_or_equal": return { symbol: "≥", label: "Greater then or equal", color: "text-orange-500 bg-orange-500/10 border-orange-500/20" };
        case "less_then": return { symbol: "<", label: "Less then", color: "text-green-500 bg-green-500/10 border-green-500/20" };
        case "less_then_or_equal": return { symbol: "≤", label: "Less then or equal", color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20" };
        case "contained_in_list": return { symbol: "∈", label: "Contained in list", color: "text-purple-500 bg-purple-500/10 border-purple-500/20" };
        case "not_contained_in_list": return { symbol: "∉", label: "Not contained in list", color: "text-red-400 bg-red-400/10 border-red-400/20" };
        case "has_all_values": return { symbol: "∩", label: "Has all values", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" };
        case "has_any_value": return { symbol: "⊂", label: "Has any value", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" };
        default: return { symbol: "?", label: "Unknown operator", color: "text-muted-foreground bg-muted/50 border-border" };
    }
};

const OperatorBadge = ({ operator }: { operator: string }) => {
    const config = getOperatorConfig(operator);
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className={cn(
                    "size-5 rounded border flex items-center justify-center font-mono text-xs font-bold leading-none shrink-0",
                    config.color
                )}>
                    {config.symbol}
                </div>
            </TooltipTrigger>
            <TooltipContent side="top">
                <p className="font-medium text-xs font-sans">{config.label}</p>
            </TooltipContent>
        </Tooltip>
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
                    "text-xs h-5 font-normal",
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
