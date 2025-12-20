"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogHeader,
} from "@/components/ui/dialog";

interface OverrideDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    conflictName?: string;
}

export const OverrideDialog = ({
    isOpen,
    onOpenChange,
    onConfirm,
    conflictName,
}: OverrideDialogProps) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent dir="rtl">
                <DialogHeader dir="rtl">
                    <DialogTitle dir="rtl">קובץ כבר קיים</DialogTitle>
                    <DialogDescription dir="rtl">
                        {conflictName
                            ? `"${conflictName}" כבר קיים בתיקייה זו. האם להחליף אותו?`
                            : "קובץ עם אותו שם כבר קיים בתיקייה זו. האם להחליף אותו?"}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
                    <Button variant="destructive" onClick={onConfirm}>החלף</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
