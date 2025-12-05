import { ApiTreeNode, FlatTreeNode } from "./types";

/** Sort children: folders first, then files, both alphabetically */
export const sortChildren = (children: ApiTreeNode[]): ApiTreeNode[] => {
    return [...children].sort((a, b) => {
        if (a.type === "folder" && b.type !== "folder") return -1;
        if (a.type !== "folder" && b.type === "folder") return 1;
        return a.name.localeCompare(b.name);
    });
};

/** Convert API tree node to flat nodes recursively */
export const flattenApiTree = (
    node: ApiTreeNode,
    parentId: string
): FlatTreeNode[] => {
    const flatNodes: FlatTreeNode[] = [];
    const nodeId = `node-${node.id}`;
    const hasNoPermission = !node.permission;
    const isFolder = node.type === "folder";
    const childIds: string[] = [];

    if (node.children && node.children.length > 0) {
        for (const child of sortChildren(node.children)) {
            childIds.push(`node-${child.id}`);
            flatNodes.push(...flattenApiTree(child, nodeId));
        }
    }

    flatNodes.push({
        id: nodeId,
        name: node.name,
        children: childIds,
        parent: parentId,
        isBranch: isFolder,
        metadata: {
            folderId: node.id,
            permission: node.permission,
            hasNoPermission,
            isLoaded: node.children !== null,
            isFile: !isFolder,
        },
    });

    return flatNodes;
};

/** Default empty tree structure */
export const createEmptyTree = (): FlatTreeNode[] => [
    { id: "root", name: "", children: ["personal", "organizational", "shared"], parent: null },
    { id: "personal", name: "אישי", children: [], parent: "root", isBranch: true, metadata: { rootType: "personal", isRootCategory: true } },
    { id: "organizational", name: "ארגוני", children: [], parent: "root", isBranch: true, metadata: { rootType: "organizational", isRootCategory: true } },
    { id: "shared", name: "משותף", children: [], parent: "root", isBranch: true, metadata: { rootType: "shared", isRootCategory: true } },
];
