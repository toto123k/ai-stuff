import { atom } from "jotai";
import { FlatTreeNode } from "@/components/library/lib-selector/types";

// Tree data atom - holds the flat tree structure
export const libTreeAtom = atom<FlatTreeNode[]>([
    { id: "root", name: "", children: [], parent: null }
]);

// Selected IDs atom - holds the Set of selected node IDs from TreeView
export const libSelectedIdsAtom = atom<Set<string>>(new Set<string>());

// Half-selected (indeterminate) IDs atom - holds IDs that are partially selected
export const libHalfSelectedIdsAtom = atom<Set<string>>(new Set<string>());

/** Result object for a selected item */
export interface SelectedLibraryItem {
    id: string;
    name: string;
    folderId?: number;
    isFile?: boolean;
}

/**
 * Derived atom that computes the selected objects using top-down scan:
 * - If a node is fully selected, return it (don't recurse children)
 * - If a node has selected descendants, recurse to find them
 * - If a node is not selected and has no selected descendants, skip it
 */
export const selectedLibraryItemsAtom = atom<SelectedLibraryItem[]>((get) => {
    const tree = get(libTreeAtom);
    const selectedIds = get(libSelectedIdsAtom);

    if (tree.length === 0 || selectedIds.size === 0) return [];

    // Build a map for quick lookup
    const nodeMap = new Map<string, FlatTreeNode>();
    for (const node of tree) {
        nodeMap.set(node.id, node);
    }

    // Memoized check for whether a node has any selected descendants
    const descendantCache = new Map<string, boolean>();
    const hasSelectedDescendant = (nodeId: string): boolean => {
        if (descendantCache.has(nodeId)) return descendantCache.get(nodeId)!;

        const node = nodeMap.get(nodeId);
        if (!node) {
            descendantCache.set(nodeId, false);
            return false;
        }

        for (const childId of node.children) {
            if (selectedIds.has(childId) || hasSelectedDescendant(childId)) {
                descendantCache.set(nodeId, true);
                return true;
            }
        }

        descendantCache.set(nodeId, false);
        return false;
    };

    const result: SelectedLibraryItem[] = [];

    const scanNode = (nodeId: string) => {
        const node = nodeMap.get(nodeId);
        if (!node) return;

        // Skip root categories (personal, organizational, shared) - they are containers
        if (node.metadata?.isRootCategory) {
            // Always recurse into root categories
            for (const childId of node.children) {
                scanNode(childId);
            }
            return;
        }

        // If fully selected, add it and stop recursion
        if (selectedIds.has(nodeId)) {
            result.push({
                id: nodeId,
                name: node.name,
                folderId: node.metadata?.folderId,
                isFile: node.metadata?.isFile,
            });
            return; // Don't recurse into children
        }

        // If has any selected descendants, recurse to find them
        if (hasSelectedDescendant(nodeId)) {
            for (const childId of node.children) {
                scanNode(childId);
            }
            return;
        }

        // Not selected and no selected descendants, skip
    };

    // Start scanning from root
    const rootNode = nodeMap.get("root");
    if (rootNode) {
        for (const childId of rootNode.children) {
            scanNode(childId);
        }
    }

    return result;
});
