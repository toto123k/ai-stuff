import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FSObject } from "./types";
import { format } from "date-fns";
import { FileIcon, FolderIcon } from "lucide-react";

interface MetadataDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    item: FSObject | null;
}

export function MetadataDialog({ isOpen, onOpenChange, item }: MetadataDialogProps) {
    if (!item) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px]" dir="rtl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {item.type === 'folder' ? (
                            <FolderIcon className="w-5 h-5 text-blue-500" />
                        ) : (
                            <FileIcon className="w-5 h-5 text-muted-foreground" />
                        )}
                        פרטי {item.type === 'folder' ? 'תיקייה' : 'קובץ'}
                    </DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground">שם</Label>
                        <p className="text-sm font-medium">{item.name}</p>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-sm text-muted-foreground">סוג</Label>
                            <div>
                                <Badge variant="secondary">
                                    {item.type === 'folder' ? 'תיקייה' : 'קובץ'}
                                </Badge>
                            </div>
                        </div>

                        {item.size !== undefined && (
                            <div className="space-y-1.5">
                                <Label className="text-sm text-muted-foreground">גודל</Label>
                                <p className="text-sm">{formatBytes(item.size)}</p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground">מזהה</Label>
                        <p className="text-sm font-mono text-muted-foreground">{item.id}</p>
                    </div>


                    <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground">נוצר ב</Label>
                        <p className="text-sm">
                            {item.createdAt ? format(new Date(item.createdAt), "dd/MM/yyyy HH:mm") : '-'}
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
