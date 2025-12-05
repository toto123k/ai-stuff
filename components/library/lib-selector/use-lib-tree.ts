"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import { ApiTreeNode, ApiTreeResponse, FlatTreeNode } from "./types";
import { flattenApiTree, sortChildren, createEmptyTree } from "./utils";

const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
});

/** Convert API response to flat tree structure */
const convertApiResponseToFlatTree = (response: ApiTreeResponse): FlatTreeNode[] => {
    const flatNodes: FlatTreeNode[] = [];
    const rootChildren: string[] = [];

    // Personal
    const personalId = "personal";
    rootChildren.push(personalId);
    const personalChildIds: string[] = [];
    if (response.personal?.children) {
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
        metadata: { rootType: "personal", isRootCategory: true, isLoaded: response.personal?.children !== null },
    });

    // Organizational
    const orgId = "organizational";
    rootChildren.push(orgId);
    const orgChildIds: string[] = [];
    for (const orgRoot of response.organizational) {
        const orgNodeId = `node-${orgRoot.id}`;
        orgChildIds.push(orgNodeId);
        const orgNodeChildIds: string[] = [];
        if (orgRoot.children?.length) {
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
            metadata: { folderId: orgRoot.id, permission: orgRoot.permission, hasNoPermission: !orgRoot.permission, isLoaded: orgRoot.children !== null },
        });
    }
    flatNodes.push({
        id: orgId,
        name: "ארגוני",
        children: orgChildIds,
        parent: "root",
        isBranch: true,
        metadata: { rootType: "organizational", isRootCategory: true, isLoaded: true },
    });

    // Shared
    const sharedId = "shared";
    rootChildren.push(sharedId);
    const sharedChildIds: string[] = [];
    for (const sharedRoot of response.shared) {
        const sharedNodeId = `node-${sharedRoot.id}`;
        sharedChildIds.push(sharedNodeId);
        const sharedNodeChildIds: string[] = [];
        if (sharedRoot.children?.length) {
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
            metadata: { folderId: sharedRoot.id, permission: sharedRoot.permission, hasNoPermission: !sharedRoot.permission, isLoaded: sharedRoot.children !== null },
        });
    }
    flatNodes.push({
        id: sharedId,
        name: "משותף",
        children: sharedChildIds,
        parent: "root",
        isBranch: true,
        metadata: { rootType: "shared", isRootCategory: true, isLoaded: true },
    });

    flatNodes.unshift({ id: "root", name: "", children: rootChildren, parent: null });
    return flatNodes;
};

export const useLibTree = () => {
    const [data, setData] = useState<FlatTreeNode[]>([{ id: "root", name: "", children: [], parent: null }]);
    const loadedNodesRef = useRef<Set<string>>(new Set());

    const { data: treeData, isLoading, error } = useSWR<ApiTreeResponse>(
        "/api/fs/tree?depth=3",
        fetcher
    );

    // Process tree data when SWR fetches it
    useEffect(() => {
        if (treeData) {
            setData(convertApiResponseToFlatTree(treeData));
        } else if (error) {
            setData(createEmptyTree());
        }
    }, [treeData, error]);

    // Lazy load handler for deeper levels
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

                for (const child of sortChildren(tree.children)) {
                    directChildIds.push(`node-${child.id}`);
                    allChildNodes.push(...flattenApiTree(child, elementId));
                }

                setData((prev) => {
                    const updated = prev.map((node) =>
                        node.id === elementId
                            ? { ...node, children: directChildIds, metadata: { ...node.metadata, isLoaded: true } }
                            : node
                    );
                    return [...updated, ...allChildNodes];
                });
            } else {
                setData((prev) => prev.map((node) =>
                    node.id === elementId ? { ...node, metadata: { ...node.metadata, isLoaded: true } } : node
                ));
            }
        } catch {
            setData((prev) => prev.map((node) =>
                node.id === elementId ? { ...node, metadata: { ...node.metadata, isLoaded: true } } : node
            ));
        }
    }, []);

    return { data, isLoading, loadNode };
};
