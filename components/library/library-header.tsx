import * as React from "react";
import { User, Building2, Share2, Clock } from "lucide-react";
import { RootType } from "@/lib/store/library-store";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StorageIndicator } from "./storage-indicator";

interface LibraryHeaderProps {
    activeRootType: RootType;
    onRootTypeChange: (type: RootType) => void;
    breadcrumbs: { id: number | null; name: string }[];
    onBreadcrumbClick: (index: number) => void;
    currentFolderId: number | null;
}

const getRootTitle = (type: RootType): string => {
    switch (type) {
        case "personal":
            return "הקבצים שלי";
        case "organizational":
            return "הקבצים האירגוניים";
        case "shared":
            return "הקבצים המשותפים שלי";
        case "personal-temporary":
            return "הקבצים הזמניים";
    }
};

export const LibraryHeader = ({
    activeRootType,
    onRootTypeChange,
    breadcrumbs,
    onBreadcrumbClick,
    currentFolderId,
}: LibraryHeaderProps) => {
    console.log("currentFolderId", currentFolderId);
    return (
        <div className="flex flex-col border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center px-6 gap-6">
                <h1 className="text-lg font-semibold hidden md:block">{getRootTitle(activeRootType)}</h1>
                <div className="h-6 w-px bg-border hidden md:block" />

                <Tabs
                    defaultValue="personal"
                    value={activeRootType}
                    onValueChange={(value) => onRootTypeChange(value as RootType)}
                    className="w-auto"
                >
                    <TabsList className="h-9 bg-muted/50 p-1">
                        <TabsTrigger value="personal" className="text-xs px-4 gap-2">
                            <User size={14} />
                            אישי
                        </TabsTrigger>
                        <TabsTrigger value="personal-temporary" className="text-xs px-4 gap-2">
                            <Clock size={14} />
                            זמניים
                        </TabsTrigger>
                        <TabsTrigger value="organizational" className="text-xs px-4 gap-2">
                            <Building2 size={14} />
                            אירגוני
                        </TabsTrigger>
                        <TabsTrigger value="shared" className="text-xs px-4 gap-2">
                            <Share2 size={14} />
                            משותף
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="flex-1" />

                {/* Find the first breadcrumb with a valid ID to use as the storage context root.
                    In Personal tabs, this is the first item (root).
                    In Shared/Org tabs, the first item is null, so it picks the selected folder (which acts as root). */}
                <StorageIndicator
                    rootId={breadcrumbs.find(b => b.id !== null)?.id ?? null}
                    className="hidden md:flex"
                    activeRootType={activeRootType}
                />
            </div>

            <div className="px-6 pb-3 pt-1">
                <Breadcrumb>
                    <BreadcrumbList>
                        {breadcrumbs.map((crumb, i) => (
                            <React.Fragment key={crumb.id ?? 'root'}>
                                {i > 0 && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
                                <BreadcrumbItem>
                                    {i === breadcrumbs.length - 1 ? (
                                        <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                                    ) : (
                                        <BreadcrumbLink
                                            onClick={() => onBreadcrumbClick(i)}
                                            className="cursor-pointer hover:text-foreground transition-colors"
                                        >
                                            {crumb.name}
                                        </BreadcrumbLink>
                                    )}
                                </BreadcrumbItem>
                            </React.Fragment>
                        ))}
                    </BreadcrumbList>
                </Breadcrumb>
            </div>
        </div>
    );
};
