"use client";

import { useRef, useCallback } from "react";
import TreeView, { INode } from "react-accessible-treeview";
import { Loader2 } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { TreeNodeMetadata } from "./types";
import { NodeRenderer } from "./node-renderer";
import { useLibTree } from "./use-lib-tree";
import { libSelectedIdsAtom, libHalfSelectedIdsAtom, disabledIdsAtom } from "@/lib/store/lib-selector-store";

export interface LibTreeViewProps {
    className?: string;
    onSelect?: (selectedIds: string[]) => void;
}

/**
 * Shared TreeView component for library selection.
 * Uses UNCONTROLLED mode with defaultSelectedIds to avoid infinite loops.
 * Selection is synced to Jotai on user interaction only.
 */
export const LibTreeView = ({ className, onSelect }: LibTreeViewProps) => {
    const { data, isLoading, loadNode } = useLibTree();
    const loadedAlertRef = useRef<HTMLDivElement>(null);

    const [selectedIds, setSelectedIds] = useAtom(libSelectedIdsAtom);
    const [, setHalfSelectedIds] = useAtom(libHalfSelectedIdsAtom);
    const disabledIds = useAtomValue(disabledIdsAtom);


    const handleLoadData = useCallback(async ({ element }: { element: INode & { metadata?: TreeNodeMetadata } }) => {
        if (element.children.length > 0 || element.metadata?.isLoaded) return;
        if (element.metadata?.hasNoPermission) return;
        if (element.metadata?.folderId) {
            await loadNode(String(element.id), element.metadata.folderId);
        }
    }, [loadNode]);

    const handleSelect = useCallback(({ treeState }: { treeState: { selectedIds: Set<string | number>; halfSelectedIds: Set<string | number>, disabledIds: Set<string | number> } }) => {
        const newSelectedIds = Array.from(treeState.selectedIds)
            .filter((id) => !disabledIds.has(id.toString()))
            .map(String);
        const newHalfSelectedIds = Array.from(treeState.halfSelectedIds).map(String);

        setSelectedIds(newSelectedIds);
        setHalfSelectedIds(newHalfSelectedIds);
        onSelect?.(newSelectedIds);
    }, [setSelectedIds, setHalfSelectedIds, onSelect]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <>
            <div ref={loadedAlertRef} className="sr-only" role="alert" aria-live="polite" />
            <TreeView
                data={data as INode<TreeNodeMetadata>[]}
                className={className}
                aria-label="בחירת ספריות"
                onLoadData={handleLoadData}
                nodeRenderer={(props) => <NodeRenderer {...props} />}
                defaultSelectedIds={selectedIds}
                onSelect={handleSelect}
                multiSelect
                propagateSelect
                propagateSelectUpwards
                togglableSelect
            />
        </>
    );
};
