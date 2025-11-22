import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogFooter,
    DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FSObject } from "./types";

interface RenameDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: () => void;
    object: FSObject | null;
    newName: string;
    setNewName: (name: string) => void;
}

export const RenameDialog = ({
    isOpen,
    onOpenChange,
    onSubmit,
    object,
    newName,
    setNewName,
}: RenameDialogProps) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent dir="rtl">
                <DialogHeader dir="rtl">
                    <DialogTitle dir="rtl">
                        שנה שם {object?.type === 'folder' ? 'תיקייה' : 'קובץ'}
                    </DialogTitle>
                </DialogHeader>
                <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="שם חדש"
                    onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
                    <Button onClick={onSubmit}>שמור</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
