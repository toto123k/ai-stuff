import { FolderIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    ContextMenu,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { FSObject, FSObjectActions } from "./types";
import { FSObjectMenu } from "./fs-object-menu";

interface FolderCardProps {
    folder: FSObject;
    onNavigate: (id: number, name: string) => void;
    actions: FSObjectActions;
}

export const FolderCard = ({ folder, onNavigate, actions }: FolderCardProps) => {
    const hasAccess = !!folder.permission;

    const folderContent = (
        <div
            onClick={() => {
                if (hasAccess) {
                    onNavigate(folder.id, folder.name);
                }
            }}
            className={cn(
                "group flex items-center gap-3 p-3 rounded-xl border border-border bg-card transition-all shadow-sm",
                !hasAccess
                    ? "opacity-50 cursor-not-allowed grayscale"
                    : "hover:bg-accent/50 hover:border-primary/30 cursor-pointer"
            )}
        >
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 group-hover:bg-blue-500/20 transition-colors">
                <FolderIcon size={20} />
            </div>
            <span className="font-medium truncate">{folder.name}</span>
        </div>
    );

    return (
        <ContextMenu>
            <ContextMenuTrigger disabled={!hasAccess}>
                {!hasAccess ? (
                    <TooltipProvider>
                        <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                                {folderContent}
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>אין לך גישה לתיקייה זו</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    folderContent
                )}
            </ContextMenuTrigger>
            {hasAccess && <FSObjectMenu object={folder} actions={actions} />}
        </ContextMenu>
    );
};
