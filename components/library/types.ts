import { PermType } from "@/lib/db/schema";

export type FSObject = {
    id: number;
    name: string;
    type: "file" | "folder";
    path: string;
    createdAt: string;
    size?: number;
    permission?: PermType;
};

export type FSObjectActions = {
    onRename: (obj: FSObject) => void;
    onDelete: (obj: FSObject) => void;
    onShare: (obj: FSObject) => void;
    onViewDetails: (obj: FSObject) => void;
    onPaste: (obj: FSObject | null) => void;
    onDownload: (obj: FSObject) => void;
    onOpen: (obj: FSObject) => void;
};

