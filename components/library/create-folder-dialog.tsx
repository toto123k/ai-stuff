import { useRef, useEffect } from "react";
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
    onSubmit: (name: string) => void;
}

export const CreateFolderDialog = ({
    isOpen,
    onOpenChange,
    onSubmit,
}: CreateFolderDialogProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.value = "";
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSubmit = () => {
        const value = inputRef.current?.value.trim() || "";
        onSubmit(value);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent dir="rtl">
                <DialogHeader dir="rtl">
                    <DialogTitle>צור תיקייה חדשה</DialogTitle>
                </DialogHeader>
                <Input
                    ref={inputRef}
                    placeholder="שם התיקייה"
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
                    <Button onClick={handleSubmit}>צור</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
