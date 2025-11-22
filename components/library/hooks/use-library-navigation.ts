"use client";

import { useAtom } from "jotai";
import {
    activeRootTypeAtom,
    currentFolderIdAtom,
    breadcrumbsAtom,
    RootType,
} from "@/lib/store/library-store";

export function useLibraryNavigation() {
    const [activeRootType, setActiveRootType] = useAtom(activeRootTypeAtom);
    const [currentFolderId, setCurrentFolderId] = useAtom(currentFolderIdAtom);
    const [breadcrumbs, setBreadcrumbs] = useAtom(breadcrumbsAtom);

    const handleNavigate = (folderId: number, name: string) => {
        setCurrentFolderId(folderId);
        setBreadcrumbs((prev) => [...prev, { id: folderId, name }]);
    };

    const handleBreadcrumbClick = (index: number) => {
        const target = breadcrumbs[index];
        setCurrentFolderId(target.id);
        setBreadcrumbs((prev) => prev.slice(0, index + 1));
    };

    const handleRootTypeChange = (type: RootType) => {
        setActiveRootType(type);
        setCurrentFolderId(null);

        let label = "אישי";
        if (type === "organizational") label = "אירגונית";
        if (type === "shared") label = "משותף איתי";

        setBreadcrumbs([{ id: null, name: label }]);
    };

    return {
        activeRootType,
        currentFolderId,
        breadcrumbs,
        handleNavigate,
        handleBreadcrumbClick,
        handleRootTypeChange,
    };
}
