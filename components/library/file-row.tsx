import { FileIcon, MoreHorizontalIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
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
import { FSObject, FSObjectActions } from "./types";
import { FSObjectMenu } from "./fs-object-menu";

interface FileRowProps {
    file: FSObject;
    actions: FSObjectActions;
}

export const FileRow = ({ file, actions }: FileRowProps) => {
    const isAccessDenied = !file.permission;

    const rowContent = (
        <TableRow className={cn(
            "group cursor-default hover:bg-muted/50",
            isAccessDenied && "opacity-50 cursor-not-allowed grayscale"
        )}>
            <TableCell>
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-red-500/10 rounded text-red-500">
                        <FileIcon size={16} />
                    </div>
                    <span className="font-medium truncate">{file.name}</span>
                </div>
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
                {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true, locale: he })}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
                2.4 MB
            </TableCell>
            <TableCell>
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
};
