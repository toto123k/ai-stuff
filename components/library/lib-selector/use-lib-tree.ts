"use client";

import { useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import { useAtom, useSetAtom } from "jotai";
import { ApiTreeNode, ApiTreeResponse, FlatTreeNode } from "./types";
import { flattenApiTree, sortChildren, createEmptyTree } from "./utils";
import { libTreeAtom, libTreeLoadedAtom } from "@/lib/store/lib-selector-store";

const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
});

/** Convert API response to flat tree structure */
const convertApiResponseToFlatTree = (response: ApiTreeResponse): FlatTreeNode[] => {
    const flatNodes: FlatTreeNode[] = [];
    const rootChildren: string[] = [];

    const personalId = "personal";
    rootChildren.push(personalId);
    const personalChildIds: string[] = [];
    let personalHasUnselectable = false;
    if (response.personal?.children) {
        personalHasUnselectable = response.personal.children.some(child => !child.permission);
        for (const child of sortChildren(response.personal.children)) {
            personalChildIds.push(`node-${child.id}`);
            flatNodes.push(...flattenApiTree(child, personalId));
        }
    }
    flatNodes.push({
        id: personalId,
        name: "אישי",
        children: personalChildIds,
        parent: "root",
        isBranch: true,
        metadata: { rootType: "personal", isRootCategory: true, isLoaded: response.personal?.children !== null, hasUnselectableChildren: personalHasUnselectable },
    });

    const orgId = "organizational";
    rootChildren.push(orgId);
    const orgChildIds: string[] = [];
    let orgHasUnselectable = false;
    for (const orgRoot of response.organizational) {
        const orgNodeId = `node-${orgRoot.id}`;
        orgChildIds.push(orgNodeId);
        if (!orgRoot.permission) orgHasUnselectable = true;

        const orgNodeChildIds: string[] = [];
        let orgRootHasUnselectable = false;
        if (orgRoot.children?.length) {
            orgRootHasUnselectable = orgRoot.children.some(child => !child.permission);
            for (const child of sortChildren(orgRoot.children)) {
                orgNodeChildIds.push(`node-${child.id}`);
                flatNodes.push(...flattenApiTree(child, orgNodeId));
            }
        }
        flatNodes.push({
            id: orgNodeId,
            name: orgRoot.name,
            children: orgNodeChildIds,
            parent: orgId,
            isBranch: true,
            metadata: { folderId: orgRoot.id, permission: orgRoot.permission, hasNoPermission: !orgRoot.permission, hasUnselectableChildren: orgRootHasUnselectable, isLoaded: orgRoot.children !== null },
        });
    }
    flatNodes.push({
        id: orgId,
        name: "ארגוני",
        children: orgChildIds,
        parent: "root",
        isBranch: true,
        metadata: { rootType: "organizational", isRootCategory: true, isLoaded: true, hasUnselectableChildren: orgHasUnselectable },
    });

    const sharedId = "shared";
    rootChildren.push(sharedId);
    const sharedChildIds: string[] = [];
    let sharedHasUnselectable = false;
    for (const sharedRoot of response.shared) {
        const sharedNodeId = `node-${sharedRoot.id}`;
        sharedChildIds.push(sharedNodeId);
        if (!sharedRoot.permission) sharedHasUnselectable = true;

        const sharedNodeChildIds: string[] = [];
        let sharedRootHasUnselectable = false;
        if (sharedRoot.children?.length) {
            sharedRootHasUnselectable = sharedRoot.children.some(child => !child.permission);
            for (const child of sortChildren(sharedRoot.children)) {
                sharedNodeChildIds.push(`node-${child.id}`);
                flatNodes.push(...flattenApiTree(child, sharedNodeId));
            }
        }
        flatNodes.push({
            id: sharedNodeId,
            name: sharedRoot.name,
            children: sharedNodeChildIds,
            parent: sharedId,
            isBranch: true,
            metadata: { folderId: sharedRoot.id, permission: sharedRoot.permission, hasNoPermission: !sharedRoot.permission, hasUnselectableChildren: sharedRootHasUnselectable, isLoaded: sharedRoot.children !== null },
        });
    }
    flatNodes.push({
        id: sharedId,
        name: "משותף",
        children: sharedChildIds,
        parent: "root",
        isBranch: true,
        metadata: { rootType: "shared", isRootCategory: true, isLoaded: true, hasUnselectableChildren: sharedHasUnselectable },
    });

    flatNodes.unshift({ id: "root", name: "", children: rootChildren, parent: null });
    return flatNodes;
};

/**
 * Hook to manage library tree data.
 * Tree data is stored in Jotai atom to persist across component mounts.
 */
export const useLibTree = () => {
    const [treeData, setTreeData] = useAtom(libTreeAtom);
    const [isLoaded, setIsLoaded] = useAtom(libTreeLoadedAtom);
    const loadedNodesRef = useRef<Set<string>>(new Set());

    const { data: apiData, isLoading, error } = useSWR<ApiTreeResponse>(
        "/api/fs/tree?depth=3",
        fetcher,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: false,
            dedupingInterval: 60000, // Don't refetch for 1 minute
        }
    );

    useEffect(() => {
        if (apiData && !isLoaded) {
            setTreeData(convertApiResponseToFlatTree(apiData));
            setIsLoaded(true);
        } else if (error && !isLoaded) {
            setTreeData(createEmptyTree());
            setIsLoaded(true);
        }
    }, [apiData, error, isLoaded, setTreeData, setIsLoaded]);

    const loadNode = useCallback(async (elementId: string, folderId: number) => {
        if (loadedNodesRef.current.has(elementId)) return;
        loadedNodesRef.current.add(elementId);

        try {
            const res = await fetch(`/api/fs/tree/${folderId}?depth=3`);
            if (!res.ok) throw new Error("Failed to fetch");
            const tree: ApiTreeNode = await res.json();

            if (tree?.children) {
                const allChildNodes: FlatTreeNode[] = [];
                const directChildIds: string[] = [];
                const hasUnselectableChildren = tree.children.some(child => !child.permission);

                for (const child of sortChildren(tree.children)) {
                    directChildIds.push(`node-${child.id}`);
                    allChildNodes.push(...flattenApiTree(child, elementId));
                }

                setTreeData((prev) => {
                    const updated = prev.map((node) =>
                        node.id === elementId
                            ? { ...node, children: directChildIds, metadata: { ...node.metadata, isLoaded: true, hasUnselectableChildren } }
                            : node
                    );
                    return [...updated, ...allChildNodes];
                });
            } else {
                setTreeData((prev) => prev.map((node) =>
                    node.id === elementId ? { ...node, metadata: { ...node.metadata, isLoaded: true } } : node
                ));
            }
        } catch {
            setTreeData((prev) => prev.map((node) =>
                node.id === elementId ? { ...node, metadata: { ...node.metadata, isLoaded: true } } : node
            ));
        }
    }, [setTreeData]);

    const hasData = treeData.length > 1;

    return {
        data: treeData,
        isLoading: isLoading && !hasData,
        loadNode,
    };
};
