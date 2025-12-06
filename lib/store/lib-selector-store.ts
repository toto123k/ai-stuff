import { atom } from "jotai";
import { FlatTreeNode } from "@/components/library/lib-selector/types";

// ============================================================================
// TREE DATA ATOM
// ============================================================================

/** Tree data atom - holds the flat tree structure from API */
export const libTreeAtom = atom<FlatTreeNode[]>([
    { id: "root", name: "", children: [], parent: null }
]);

/** Flag to track if tree has been loaded */
export const libTreeLoadedAtom = atom(false);

// ============================================================================
// SELECTION STATE - Simple string arrays, no derived state complexity
// ============================================================================

/** Selected node IDs - stored as simple string array for stability */
export const libSelectedIdsAtom = atom<string[]>([]);

/** Half-selected (indeterminate) node IDs */
export const libHalfSelectedIdsAtom = atom<string[]>([]);

// ============================================================================
// DERIVED ATOM - Computes selected items from tree + selection
// ============================================================================

export interface SelectedLibraryItem {
    id: string;
    name: string;
    folderId?: number;
    isFile?: boolean;
}

/**
 * Derived atom that computes the selected objects.
 * Uses top-down scan: if a parent is selected, don't include children.
 */
export const selectedLibraryItemsAtom = atom<SelectedLibraryItem[]>((get) => {
    const tree = get(libTreeAtom);
    const selectedIds = get(libSelectedIdsAtom);

    if (tree.length === 0 || selectedIds.length === 0) return [];

    // Convert to Set for O(1) lookup
    const selectedSet = new Set(selectedIds);

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
            if (selectedSet.has(childId) || hasSelectedDescendant(childId)) {
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

        // Skip root categories - they are containers
        if (node.metadata?.isRootCategory) {
            for (const childId of node.children) {
                scanNode(childId);
            }
            return;
        }

        // If fully selected, add it and stop recursion
        if (selectedSet.has(nodeId)) {
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
        }
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


export const disabledIdsAtom = atom<Set<string>>((get) => {
    const tree = get(libTreeAtom);
    return new Set(tree.filter(node => node.metadata?.hasNoPermission).map(node => node.id));
});