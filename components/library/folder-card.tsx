import { useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
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
import { createFSObjectStateAtom, fsObjectStatesAtom } from "@/lib/store/library-store";

interface FolderCardProps {
    folder: FSObject;
    onNavigate: (id: number, name: string) => void;
    actions: FSObjectActions;
}

export const FolderCard = ({ folder, onNavigate, actions }: FolderCardProps) => {
    const hasAccess = !!folder.permission;

    const stateAtom = useMemo(() => createFSObjectStateAtom(folder.id), [folder.id]);
    const stateSet = useAtomValue(stateAtom);
    const isSelected = stateSet.has("selected");
    const isCut = stateSet.has("cut");
    const isCopy = stateSet.has("copy");

    const setStates = useSetAtom(fsObjectStatesAtom);

    const handleContextMenu = () => {
        if (!hasAccess) return;

        // If this folder is already selected, don't change selection (preserve multi-select)
        // If not selected, clear all selections and select only this folder
        if (!isSelected) {
            setStates((prev) => {
                const next = new Map(prev);

                // Clear all "selected" states, but preserve "cut"/"copy"
                for (const [id, state] of next.entries()) {
                    if (state.has("selected")) {
                        const nextState = new Set(state);
                        nextState.delete("selected");
                        if (nextState.size === 0) {
                            next.delete(id);
                        } else {
                            next.set(id, nextState);
                        }
                    }
                }

                // Select this folder
                const currentState = next.get(folder.id) || new Set();
                const nextState = new Set(currentState);
                nextState.add("selected");
                next.set(folder.id, nextState);

                return next;
            });
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        if (!hasAccess) return;

        if (e.ctrlKey || e.metaKey) {
            // Ctrl+Click: toggle selection (add/remove from multi-select)
            e.stopPropagation();
            e.preventDefault();
            setStates((prev) => {
                const next = new Map(prev);
                const currentState = next.get(folder.id) || new Set();
                const nextState = new Set(currentState);

                if (nextState.has("selected")) {
                    nextState.delete("selected");
                } else {
                    nextState.add("selected");
                }

                if (nextState.size === 0) {
                    next.delete(folder.id);
                } else {
                    next.set(folder.id, nextState);
                }

                return next;
            });
        } else {
            // Regular click: clear all and select only this folder
            setStates((prev) => {
                const next = new Map(prev);

                // Clear all "selected" states, but preserve "cut"/"copy"
                for (const [id, state] of next.entries()) {
                    if (state.has("selected")) {
                        const nextState = new Set(state);
                        nextState.delete("selected");
                        if (nextState.size === 0) {
                            next.delete(id);
                        } else {
                            next.set(id, nextState);
                        }
                    }
                }

                // Select this folder
                const currentState = next.get(folder.id) || new Set();
                const nextState = new Set(currentState);
                nextState.add("selected");
                next.set(folder.id, nextState);

                return next;
            });
        }
    };

    const handleDoubleClick = () => {
        if (hasAccess) {
            onNavigate(folder.id, folder.name);
        }
    };

    const folderContent = (
        <div
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            className={cn(
                "group flex items-center gap-3 p-3 rounded-xl border border-border bg-card transition-all shadow-sm",
                !hasAccess
                    ? "opacity-50 cursor-not-allowed grayscale"
                    : "hover:bg-accent/50 hover:border-primary/30 cursor-pointer",
                isSelected && "bg-primary/10 border-primary/50",
                (isCut) && "opacity-50 grayscale",
                (isCopy) && "opacity-80"
            )}
        >
            <div className={cn(
                "p-2 rounded-lg transition-colors",
                isSelected ? "bg-primary/20 text-primary" : "bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20"
            )}>
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
