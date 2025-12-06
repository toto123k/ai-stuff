"use client";

import { createContext, useContext, useMemo, useEffect, ReactNode, RefObject } from "react";
import { UploadIcon, ArrowUpDown, ArrowUp, ArrowDown, FileIcon } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    SortingState,
    ColumnDef,
    flexRender,
    Table as TanstackTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FSObject, FSObjectActions } from "./types";
import { FileRow } from "./file-row";
import { selectedFileIdsAtom } from "@/lib/store/library-store";

interface FilesTableContextValue {
    table: TanstackTable<FSObject>;
    actions: FSObjectActions;
    allFileIds: number[];
    fileInputRef: RefObject<HTMLInputElement>;
}

const FilesTableContext = createContext<FilesTableContextValue | null>(null);

function useFilesTableContext() {
    const context = useContext(FilesTableContext);
    if (!context) {
        throw new Error("FilesTable components must be used within FilesTable.Root");
    }
    return context;
}

interface RootProps {
    files: FSObject[];
    actions: FSObjectActions;
    fileInputRef: RefObject<HTMLInputElement>;
    children: ReactNode;
}

function Root({ files, actions, fileInputRef, children }: RootProps) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const setSelectedIds = useSetAtom(selectedFileIdsAtom);

    const allFileIds = useMemo(() => files.map(f => f.id), [files]);

    useEffect(() => {
        setSelectedIds(new Set());
    }, [allFileIds.join(","), setSelectedIds]);

    const columns = useMemo<ColumnDef<FSObject>[]>(() => [
        {
            accessorKey: "name",
            header: ({ column }) => (
                <SortButton column={column}>שם</SortButton>
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-red-500/10 rounded text-red-500">
                        <FileIcon size={16} />
                    </div>
                    <span className="font-medium truncate">{row.original.name}</span>
                </div>
            ),
        },
        {
            accessorKey: "createdAt",
            header: ({ column }) => (
                <SortButton column={column}>שונה</SortButton>
            ),
            cell: ({ row }) => (
                <span className="text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true, locale: he })}
                </span>
            ),
            sortingFn: (rowA, rowB) => {
                return new Date(rowA.original.createdAt).getTime() - new Date(rowB.original.createdAt).getTime();
            },
        },
        {
            accessorKey: "size",
            header: ({ column }) => (
                <SortButton column={column}>גודל</SortButton>
            ),
            cell: () => (
                <span className="text-muted-foreground text-xs">2.4 MB</span>
            ),
        },
    ], []);

    const table = useReactTable({
        data: files,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const contextValue = useMemo(() => ({
        table,
        actions,
        allFileIds,
        fileInputRef,
    }), [table, actions, allFileIds, fileInputRef]);

    return (
        <FilesTableContext.Provider value={contextValue}>
            {children}
        </FilesTableContext.Provider>
    );
}

interface SortButtonProps {
    column: {
        toggleSorting: (desc?: boolean) => void;
        getIsSorted: () => false | "asc" | "desc";
    };
    children: ReactNode;
}

function SortButton({ column, children }: SortButtonProps) {
    const sorted = column.getIsSorted();
    return (
        <Button
            variant="ghost"
            className="p-0 h-auto font-medium hover:bg-transparent"
            onClick={() => column.toggleSorting(sorted === "asc")}
        >
            {children}
            {sorted === "asc" ? (
                <ArrowUp className="mr-2 h-4 w-4" />
            ) : sorted === "desc" ? (
                <ArrowDown className="mr-2 h-4 w-4" />
            ) : (
                <ArrowUpDown className="mr-2 h-4 w-4 opacity-50" />
            )}
        </Button>
    );
}

interface HeaderProps {
    className?: string;
}

function HeaderComponent({ className }: HeaderProps) {
    const { table, allFileIds } = useFilesTableContext();
    const selectedIds = useAtomValue(selectedFileIdsAtom);
    const setSelectedIds = useSetAtom(selectedFileIdsAtom);

    const isAllSelected = allFileIds.length > 0 && selectedIds.size === allFileIds.length;
    const isPartiallySelected = selectedIds.size > 0 && selectedIds.size < allFileIds.length;

    const handleToggleAll = () => {
        if (isAllSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(allFileIds));
        }
    };

    return (
        <TableHeader className={className}>
            <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 px-4">
                    <div className="flex items-center justify-center">
                        <Checkbox
                            checked={isAllSelected}
                            ref={(el) => {
                                if (el) {
                                    const button = el as HTMLButtonElement;
                                    if (isPartiallySelected) {
                                        button.dataset.state = "indeterminate";
                                    }
                                }
                            }}
                            onCheckedChange={handleToggleAll}
                            aria-label="בחר הכל"
                        />
                    </div>
                </TableHead>
                {table.getHeaderGroups().map((headerGroup) =>
                    headerGroup.headers.map((header) => (
                        <TableHead
                            key={header.id}
                            className={cn(
                                "text-right",
                                header.id === "name" && "w-[50%]"
                            )}
                        >
                            {header.isPlaceholder
                                ? null
                                : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                    ))
                )}
                <TableHead className="w-[50px]" />
            </TableRow>
        </TableHeader>
    );
}

interface BodyProps {
    className?: string;
}

function Body({ className }: BodyProps) {
    const { table, actions, allFileIds } = useFilesTableContext();
    const rows = table.getRowModel().rows;

    return (
        <TableBody className={className}>
            {rows.length > 0 ? (
                rows.map((row) => (
                    <FileRow.Root
                        key={row.original.id}
                        file={row.original}
                        allFileIds={allFileIds}
                        actions={actions}
                    >
                        {row.getVisibleCells().map((cell) => (
                            <FileRow.Cell key={cell.id}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </FileRow.Cell>
                        ))}
                    </FileRow.Root>
                ))
            ) : (
                <Empty />
            )}
        </TableBody>
    );
}

function Empty() {
    const { fileInputRef } = useFilesTableContext();

    return (
        <TableRow>
            <TableCell colSpan={5} className="h-32 text-center">
                <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <div
                        className="p-3 bg-muted rounded-full cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <UploadIcon className="w-6 h-6 opacity-50" />
                    </div>
                    <p>אין קבצים בתיקייה זו</p>
                </div>
            </TableCell>
        </TableRow>
    );
}

interface CountProps {
    className?: string;
}

function Count({ className }: CountProps) {
    const { allFileIds } = useFilesTableContext();
    const selectedIds = useAtomValue(selectedFileIdsAtom);

    return (
        <h3 className={cn("text-sm font-medium text-muted-foreground", className)}>
            קבצים ({allFileIds.length})
            {selectedIds.size > 0 && (
                <span className="mr-2 text-primary">
                    • {selectedIds.size} נבחרו
                </span>
            )}
        </h3>
    );
}

interface ContainerProps {
    children: ReactNode;
    className?: string;
}

function Container({ children, className }: ContainerProps) {
    return (
        <div className={cn("rounded-lg border bg-card", className)}>
            <Table>
                {children}
            </Table>
        </div>
    );
}

export const FilesTable = {
    Root,
    Header: HeaderComponent,
    Body,
    Empty,
    Count,
    Container,
};
