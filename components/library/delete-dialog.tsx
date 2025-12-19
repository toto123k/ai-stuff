import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogHeader,
} from "@/components/ui/dialog";
import { FSObject } from "./types";

interface DeleteDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    targets: FSObject[];
}

export const DeleteDialog = ({
    isOpen,
    onOpenChange,
    onConfirm,
    targets,
}: DeleteDialogProps) => {
    const count = targets.length;
    const isSingle = count === 1;
    const target = isSingle ? targets[0] : null;

    const title = isSingle
        ? `למחוק את ${target?.name}?`
        : `למחוק ${count} פריטים?`;

    const description = isSingle
        ? `פעולה זו אינה ניתנת לביטול. היא תמחק לצמיתות את ה${target?.type === 'folder' ? 'תיקייה' : 'קובץ'} ואת תכולתו.`
        : `פעולה זו אינה ניתנת לביטול. היא תמחק לצמיתות ${count} פריטים ואת תכולתם.`;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent dir="rtl">
                <DialogHeader dir="rtl">
                    <DialogTitle dir="rtl">{title}</DialogTitle>
                    <DialogDescription dir="rtl">
                        {description}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
                    <Button variant="destructive" onClick={onConfirm}>מחק</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
