"use client";

import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { LoaderIcon, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FSObject } from "./types";
import { toast } from "sonner";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    file: FSObject | null;
}

export function PdfPreviewDialog({ isOpen, onOpenChange, file }: PdfPreviewDialogProps) {
    const [numPages, setNumPages] = useState<number | null>(null);
    const [scale, setScale] = useState(1.0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setIsLoading(false);
        setError(null);
    }, []);

    const onDocumentLoadError = useCallback((err: Error) => {
        console.error("Error loading PDF:", err);
        setError(err.message || "Failed to load PDF");
        setIsLoading(false);
        toast.error("שגיאה בטעינת הקובץ");
    }, []);

    const zoomIn = useCallback(() => {
        setScale((prev) => Math.min(prev + 0.25, 3));
    }, []);

    const zoomOut = useCallback(() => {
        setScale((prev) => Math.max(prev - 0.25, 0.5));
    }, []);

    // Reset state when dialog closes
    const handleOpenChange = useCallback((open: boolean) => {
        if (!open) {
            setNumPages(null);
            setScale(1.0);
            setIsLoading(true);
            setError(null);
        }
        onOpenChange(open);
    }, [onOpenChange]);

    const pdfUrl = file ? `/api/fs/download?fileId=${file.id}&proxy=true` : null;

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <DialogHeader dir="ltr" className="flex-shrink-0">
                    <DialogTitle>{file?.name || "תצוגה מקדימה"}</DialogTitle>
                </DialogHeader>

                {/* Toolbar */}
                <div className="flex items-center justify-center gap-4 py-2 border-b flex-shrink-0">
                    <span className="text-sm text-muted-foreground">
                        {numPages ? `${numPages} עמודים` : "..."}
                    </span>

                    <div className="h-6 w-px bg-border" />

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={zoomOut}
                            disabled={scale <= 0.5}
                        >
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <span className="text-sm min-w-[50px] text-center">
                            {Math.round(scale * 100)}%
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={zoomIn}
                            disabled={scale >= 3}
                        >
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* PDF Content - Scrollable */}
                <div className="flex-1 overflow-auto relative bg-gray-100">
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
                    ) : pdfUrl ? (
                        <Document
                            file={pdfUrl}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={onDocumentLoadError}
                            loading={null}
                            className="flex flex-col items-center gap-4 py-4"
                        >
                            {numPages && Array.from({ length: numPages }, (_, index) => (
                                <Page
                                    key={`page_${index + 1}`}
                                    pageNumber={index + 1}
                                    scale={scale}
                                    className="shadow-lg"
                                    renderTextLayer={true}
                                    renderAnnotationLayer={true}
                                />
                            ))}
                        </Document>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}

