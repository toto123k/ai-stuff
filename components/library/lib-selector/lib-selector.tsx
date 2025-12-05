"use client";

import { useRef, useEffect } from "react";
import TreeView, { INode } from "react-accessible-treeview";
import { ChevronDown, Loader2 } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../../ui/dropdown-menu";
import { Button } from "../../ui/button";
import { TreeNodeMetadata } from "./types";
import { NodeRenderer } from "./node-renderer";
import { useLibTree } from "./use-lib-tree";
import { libTreeAtom, libSelectedIdsAtom, libHalfSelectedIdsAtom, selectedLibraryItemsAtom } from "@/lib/store/lib-selector-store";

export interface LibSelectorProps {
    className?: string;
    onSelect?: (selectedIds: string[]) => void;
}

export const LibSelector = ({ className, onSelect }: LibSelectorProps) => {
    const { data, isLoading, loadNode } = useLibTree();
    const loadedAlertRef = useRef<HTMLDivElement>(null);

    const setLibTree = useSetAtom(libTreeAtom);
    const selectedIds = useAtomValue(libSelectedIdsAtom);
    const setSelectedIds = useSetAtom(libSelectedIdsAtom);
    const setHalfSelectedIds = useSetAtom(libHalfSelectedIdsAtom);

    const selectedLibraryItems = useAtomValue(selectedLibraryItemsAtom);
    console.log(selectedLibraryItems)

    // Sync tree data to store whenever it changes
    useEffect(() => {
        setLibTree(data);
    }, [data, setLibTree]);

    const handleLoadData = async ({ element }: { element: INode & { metadata?: TreeNodeMetadata } }) => {
        if (element.children.length > 0 || element.metadata?.isLoaded) return;
        if (element.metadata?.hasNoPermission) return;
        if (element.metadata?.folderId) {
            await loadNode(String(element.id), element.metadata.folderId);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className={cn("justify-between", className)}>
                    בחר ספריות
                    <ChevronDown className="mr-2 h-4 w-4 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 p-2" align="start">
                <div ref={loadedAlertRef} className="sr-only" role="alert" aria-live="polite" />
                {isLoading ? (
                    <div className="flex items-center justify-center p-4">
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <TreeView
                        data={data as INode<TreeNodeMetadata>[]}
                        className="space-y-0.5"
                        aria-label="בחירת ספריות"
                        onLoadData={handleLoadData}
                        nodeRenderer={(props) => <NodeRenderer {...props} />}
                        selectedIds={Array.from(selectedIds)}
                        onSelect={({ treeState }) => {
                            const newSelectedIds = new Set(Array.from(treeState.selectedIds).map(String));
                            const halfSelectedIds = new Set(Array.from(treeState.halfSelectedIds).map(String));
                            setSelectedIds(newSelectedIds);
                            setHalfSelectedIds(halfSelectedIds);
                            onSelect?.(Array.from(newSelectedIds));
                        }}
                        multiSelect
                        propagateSelect
                        propagateSelectUpwards
                        togglableSelect
                    />
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
