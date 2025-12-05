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
    selectedFileIdsAtom,
    lastClickedFileIdAtom,
    createFileSelectedAtom,
} from "@/lib/store/library-store";

interface RootProps {
    file: FSObject;
    allFileIds: number[];
    actions: FSObjectActions;
    children: ReactNode;
}

const Root = memo(({ file, allFileIds, actions, children }: RootProps) => {
    const isAccessDenied = !file.permission;

    // This atom only triggers re-render when THIS file's selection changes
    const isSelectedAtom = useMemo(() => createFileSelectedAtom(file.id), [file.id]);
    const isSelected = useAtomValue(isSelectedAtom);

    const setSelectedIds = useSetAtom(selectedFileIdsAtom);
    const setLastClickedId = useSetAtom(lastClickedFileIdAtom);
    const store = useStore();

    console.log(file)
    const handleRowClick = useCallback((e: React.MouseEvent) => {
        if (isAccessDenied) return;

        const lastClickedId = store.get(lastClickedFileIdAtom);

        setSelectedIds((prev) => {
            const next = new Set(prev);

            if (e.shiftKey && lastClickedId !== null) {
                const lastIndex = allFileIds.indexOf(lastClickedId);
                const currentIndex = allFileIds.indexOf(file.id);
                if (lastIndex !== -1 && currentIndex !== -1) {
                    const start = Math.min(lastIndex, currentIndex);
                    const end = Math.max(lastIndex, currentIndex);
                    for (let i = start; i <= end; i++) {
                        next.add(allFileIds[i]);
                    }
                }
            } else if (e.ctrlKey || e.metaKey) {
                if (next.has(file.id)) {
                    next.delete(file.id);
                } else {
                    next.add(file.id);
                }
            } else {
                next.clear();
                next.add(file.id);
            }

            return next;
        });

        if (!e.shiftKey) {
            setLastClickedId(file.id);
        }
    }, [file.id, isAccessDenied, allFileIds, store, setSelectedIds, setLastClickedId]);

    const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        handleRowClick(e);
    }, [handleRowClick]);

    const rowContent = (
        <TableRow
            className={cn(
                "group cursor-pointer select-none",
                isAccessDenied && "opacity-50 cursor-not-allowed grayscale",
                isSelected && "bg-primary/10 hover:bg-primary/15"
            )}
            onClick={handleRowClick}
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
