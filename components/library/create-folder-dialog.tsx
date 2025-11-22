import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogFooter,
    DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface CreateFolderDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: () => void;
    folderName: string;
    setFolderName: (name: string) => void;
}

export const CreateFolderDialog = ({
    isOpen,
    onOpenChange,
    onSubmit,
    folderName,
    setFolderName,
}: CreateFolderDialogProps) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>צור תיקייה חדשה</DialogTitle>
                </DialogHeader>
                <Input
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    placeholder="שם התיקייה"
                    onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
                    <Button onClick={onSubmit}>צור</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
