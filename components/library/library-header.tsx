import * as React from "react";
import { User, Building2 } from "lucide-react";
import { RootType } from "@/lib/db/schema";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LibraryHeaderProps {
    activeRootType: "personal" | "organizational";
    onRootTypeChange: (type: "personal" | "organizational") => void;
    breadcrumbs: { id: number | null; name: string }[];
    onBreadcrumbClick: (index: number) => void;
}

export const LibraryHeader = ({
    activeRootType,
    onRootTypeChange,
    breadcrumbs,
    onBreadcrumbClick,
}: LibraryHeaderProps) => {
    return (
        <div className="flex flex-col border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center px-6 gap-6">
                <h1 className="text-lg font-semibold hidden md:block">הקבצים שלי</h1>
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
                        <TabsTrigger value="organizational" className="text-xs px-4 gap-2">
                            <Building2 size={14} />
                            אירגוני
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="px-6 pb-3 pt-1">
                <Breadcrumb>
                    <BreadcrumbList>
                        {breadcrumbs.map((crumb, i) => (
                            <React.Fragment key={crumb.id ?? 'root'}>
                                {i > 0 && <BreadcrumbSeparator />}
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
