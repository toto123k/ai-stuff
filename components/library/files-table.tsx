import { UploadIcon } from "lucide-react";
import { RefObject } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { FSObject, FSObjectActions } from "./types";
import { FileRow } from "./file-row";

interface FilesTableProps {
    files: FSObject[];
    actions: FSObjectActions;
    fileInputRef: RefObject<HTMLInputElement>;
}

export const FilesTable = ({ files, actions, fileInputRef }: FilesTableProps) => {
    return (
        <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
                קבצים ({files.length})
            </h3>
            <div className="rounded-lg border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="text-right w-[50%]">שם</TableHead>
                            <TableHead className="text-right">שונה</TableHead>
                            <TableHead className="text-right">גודל</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {files.map(file => (
                            <FileRow key={file.id} file={file} actions={actions} />
                        ))}
                        {files.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center">
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
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};
