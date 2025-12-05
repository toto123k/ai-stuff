import { PermType } from "@/lib/db/schema";

export type RootCategory = "personal" | "organizational" | "shared";

/** API tree node from getTreeHierarchy */
export interface ApiTreeNode {
    id: number;
    name: string;
    type: "file" | "folder";
    path: string;
    createdAt: string | null;
    permission: PermType | null;
    children: ApiTreeNode[] | null; // null = unloaded, [] = empty
}

/** API response from /api/fs/tree */
export interface ApiTreeResponse {
    personal: ApiTreeNode | null;
    organizational: ApiTreeNode[];
    shared: ApiTreeNode[];
}

export interface TreeNodeMetadata {
    folderId?: number;
    rootType?: RootCategory;
    isRootCategory?: boolean;
    permission?: PermType | null;
    hasNoPermission?: boolean;
    isLoaded?: boolean;
    isFile?: boolean;
    [key: string]: any;
}

export interface FlatTreeNode {
    id: string;
    name: string;
    children: string[];
    parent: string | null;
    isBranch?: boolean;
    metadata?: TreeNodeMetadata;
}
