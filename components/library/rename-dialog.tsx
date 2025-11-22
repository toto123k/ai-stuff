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
import { FSObject } from "./types";

interface RenameDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (name: string) => void;
    object: FSObject | null;
}

export const RenameDialog = ({
    isOpen,
    onOpenChange,
    onSubmit,
    object,
}: RenameDialogProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && inputRef.current && object) {
            inputRef.current.value = object.name;
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isOpen, object]);

    const handleSubmit = () => {
        const value = inputRef.current?.value.trim() || "";
        onSubmit(value);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent dir="rtl">
                <DialogHeader dir="rtl">
                    <DialogTitle dir="rtl">
                        שנה שם {object?.type === 'folder' ? 'תיקייה' : 'קובץ'}
                    </DialogTitle>
                </DialogHeader>
                <Input
                    ref={inputRef}
                    placeholder="שם חדש"
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
                    <Button onClick={handleSubmit}>שמור</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
