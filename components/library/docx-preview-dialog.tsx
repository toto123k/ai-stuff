import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { LoaderIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FSObject } from "./types";
import { toast } from "sonner";

interface DocxPreviewDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    file: FSObject | null;
}

export function DocxPreviewDialog({ isOpen, onOpenChange, file }: DocxPreviewDialogProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !file) {
            return;
        }

        const loadDocx = async () => {
            setIsLoading(true);
            setError(null);

            // Clear previous content
            if (containerRef.current) {
                containerRef.current.innerHTML = "";
            }

            try {
                // Fetch the file content directly via proxy to avoid CORS
                const res = await fetch(`/api/fs/download?fileId=${file.id}&proxy=true`);
                if (!res.ok) {
                    throw new Error("Failed to fetch file content");
                }
                const blob = await res.blob();

                if (containerRef.current) {
                    await renderAsync(blob, containerRef.current, undefined, {
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        breakPages: true,
                        ignoreLastRenderedPageBreak: true,
                        experimental: false,
                        trimXmlDeclaration: true,
                        useBase64URL: false,

                    });
                }
            } catch (err) {
                console.error("Error previewing DOCX:", err);
                const msg = err instanceof Error ? err.message : "Failed to load document preview";
                setError(msg);
                toast.error(msg);
            } finally {
                setIsLoading(false);
            }
        };

        loadDocx();
    }, [isOpen, file]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <DialogHeader dir="ltr">
                    <DialogTitle>{file?.name || "תצוגה מקדימה"}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-auto relative">
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                            <LoaderIcon className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    )}

                    {error ? (
                        <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2" dir="rtl">
                            <p className="font-medium text-lg">שגיאה בטעינת הקובץ</p>
                            <p className="text-sm text-muted-foreground">{error}</p>
                        </div>
                    ) : (
                        <div ref={containerRef} />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
