"use client";

import { memo, useCallback, useMemo, ReactNode } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { FSObject, FSObjectActions } from "./types";
import { FSObjectMenu } from "./fs-object-menu";
import {
    fsObjectStatesAtom,
    lastClickedFileIdAtom,
    createFSObjectStateAtom,
} from "@/lib/store/library-store";

interface RootProps {
    file: FSObject;
    allFileIds: number[];
    actions: FSObjectActions;
    children: ReactNode;
}

const Root = memo(({ file, allFileIds, actions, children }: RootProps) => {
    const isAccessDenied = !file.permission;

    // This atom only triggers re-render when THIS file's state changes
    const stateAtom = useMemo(() => createFSObjectStateAtom(file.id), [file.id]);
    const stateSet = useAtomValue(stateAtom);
    const isSelected = stateSet.has("selected");
    const isCut = stateSet.has("cut");
    const isCopy = stateSet.has("copy");

    const setStates = useSetAtom(fsObjectStatesAtom);
    const setLastClickedId = useSetAtom(lastClickedFileIdAtom);
    const store = useStore();

    const handleRowClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent deselection from background click
        if (isAccessDenied) return;

        const lastClickedId = store.get(lastClickedFileIdAtom);

        setStates((prev) => {
            const next = new Map(prev);

            if (e.shiftKey && lastClickedId !== null) {
                const lastIndex = allFileIds.indexOf(lastClickedId);
                const currentIndex = allFileIds.indexOf(file.id);
                if (lastIndex !== -1 && currentIndex !== -1) {
                    const start = Math.min(lastIndex, currentIndex);
                    const end = Math.max(lastIndex, currentIndex);

                    // Clear previous selection if needed? Standard behavior usually keeps ctrl selection or adds range.
                    // Here we'll stick to simple range selection logic: add range to current selection?
                    // Actually Windows Explorer behavior: Shift+Click sets the range anchor from last focus.
                    // We'll simplisticly just ensure the range is selected.

                    // First, standard behavior usually clears others if NOT ctrl held, but here we'll just add range for simplicity or follow previous logic.
                    // Previous logic: "next.add(allFileIds[i])". It didn't clear others?
                    // "const next = new Set(prev)". So it added to existing.

                    for (let i = start; i <= end; i++) {
                        const id = allFileIds[i];
                        const currentState = next.get(id) || new Set();
                        if (!currentState.has("selected")) {
                            const nextState = new Set(currentState);
                            nextState.add("selected");
                            next.set(id, nextState);
                        }
                    }
                }
            } else if (e.ctrlKey || e.metaKey) {
                const currentState = next.get(file.id) || new Set();
                const nextState = new Set(currentState);
                if (nextState.has("selected")) {
                    nextState.delete("selected");
                } else {
                    nextState.add("selected");
                }

                if (nextState.size === 0) {
                    next.delete(file.id);
                } else {
                    next.set(file.id, nextState);
                }
            } else {
                // Clear all assignments of "selected" without removing "cut"/"copy" if we want to preserve them?
                // Usually selection clears.
                next.forEach((s, id) => {
                    if (s.has("selected")) {
                        const nextS = new Set(s);
                        nextS.delete("selected");
                        if (nextS.size === 0) {
                            next.delete(id);
                        } else {
                            next.set(id, nextS);
                        }
                    }
                });

                const currentState = next.get(file.id) || new Set();
                const nextState = new Set(currentState);
                nextState.add("selected");
                next.set(file.id, nextState);
            }

            return next;
        });

        if (!e.shiftKey) {
            setLastClickedId(file.id);
        }
    }, [file.id, isAccessDenied, allFileIds, store, setStates, setLastClickedId]);

    const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        // Checkbox click behaves like Ctrl+Click (toggles only this one)
        if (isAccessDenied) return;

        setStates((prev) => {
            const next = new Map(prev);
            const currentState = next.get(file.id) || new Set();
            const nextState = new Set(currentState);

            if (nextState.has("selected")) {
                nextState.delete("selected");
            } else {
                nextState.add("selected");
            }

            if (nextState.size === 0) {
                next.delete(file.id);
            } else {
                next.set(file.id, nextState);
            }

            return next;
        });

        setLastClickedId(file.id);
    }, [file.id, isAccessDenied, setStates, setLastClickedId]);

    const handleContextMenu = useCallback(() => {
        if (isAccessDenied) return;

        // If this file is already selected, don't change selection (preserve multi-select)
        // If not selected, clear all selections and select only this file
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

                // Select this file
                const currentState = next.get(file.id) || new Set();
                const nextState = new Set(currentState);
                nextState.add("selected");
                next.set(file.id, nextState);

                return next;
            });

            setLastClickedId(file.id);
        }
    }, [file.id, isAccessDenied, isSelected, setStates, setLastClickedId]);

    const handleDoubleClick = useCallback(() => {
        if (isAccessDenied) return;
        actions.onOpen(file);
    }, [isAccessDenied, actions, file]);

    const rowContent = (
        <TableRow
            className={cn(
                "group cursor-pointer select-none",
                isAccessDenied && "opacity-50 cursor-not-allowed grayscale",
                isSelected && "bg-primary/10 hover:bg-primary/15",
                (isCut) && "opacity-50 grayscale",
                (isCopy) && "opacity-80"
            )}
            onClick={handleRowClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            data-state={isSelected ? "selected" : undefined}
        >
            <TableCell className="w-12 px-4" onClick={handleCheckboxClick}>
                <div className="flex items-center justify-center">
                    <Checkbox
                        checked={isSelected}
                        disabled={isAccessDenied}
                        aria-label={`בחר ${file.name}`}
                    />
                </div>
            </TableCell>
            {children}
            <TableCell className="w-[50px]">
                <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isAccessDenied}>
                        <MoreHorizontalIcon size={14} />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild disabled={isAccessDenied}>
                {isAccessDenied ? (
                    <TooltipProvider>
                        <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                                {rowContent}
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>אין לך גישה לקובץ זה</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    rowContent
                )}
            </ContextMenuTrigger>
            <FSObjectMenu object={file} actions={actions} />
        </ContextMenu>
    );
}, (prevProps, nextProps) => {
    // Custom comparison: children are derived from file data, so we only need to compare file.id and actions.
    // allFileIds can change but is only used for shift+click, which is rare enough to not optimize.
    return prevProps.file.id === nextProps.file.id &&
        prevProps.actions === nextProps.actions;
});

Root.displayName = "FileRow.Root";

interface CellProps {
    children: ReactNode;
    className?: string;
}

function Cell({ children, className }: CellProps) {
    return <TableCell className={className}>{children}</TableCell>;
}

export const FileRow = {
    Root,
    Cell,
};
