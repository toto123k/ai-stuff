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
    object: FSObject | null;
}

export const DeleteDialog = ({
    isOpen,
    onOpenChange,
    onConfirm,
    object,
}: DeleteDialogProps) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent dir="rtl">
                <DialogHeader dir="rtl">
                    <DialogTitle dir="rtl">למחוק את {object?.name}?</DialogTitle>
                    <DialogDescription dir="rtl">
                        פעולה זו אינה ניתנת לביטול. היא תמחק לצמיתות את ה{object?.type === 'folder' ? 'תיקייה' : 'קובץ'} ואת תכולתו.
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
