"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FSObject } from "./types";
import { LoaderIcon, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";

interface DocxPreviewDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    file: FSObject | null;
}

export const DocxPreviewDialog = ({ isOpen, onOpenChange, file }: DocxPreviewDialogProps) => {
    const [isLoading, setIsLoading] = useState(true);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch the S3 presigned URL when dialog opens
    useEffect(() => {
        if (!isOpen || !file) {
            setPreviewUrl(null);
            setError(null);
            return;
        }

        const fetchPreviewUrl = async () => {
            setIsLoading(true);
            setError(null);
            setPreviewUrl(null);

            try {
                const extension = file.name.split('.').pop()?.toLowerCase();
                const isPdf = extension === 'pdf';

                // Fetch the presigned S3 URL from the download API
                const response = await fetch(`/api/fs/download?fileId=${file.id}&download=true`);
                if (!response.ok) {
                    throw new Error("Failed to get file URL");
                }

                const data = await response.json();
                const s3Url = data.url;

                if (isPdf) {
                    // For PDFs, use the S3 URL directly
                    setPreviewUrl(s3Url);
                } else {
                    // For Office files, use Office Online Viewer with the S3 URL
                    setPreviewUrl(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(s3Url)}`);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load preview");
            }
        };

        fetchPreviewUrl();
    }, [isOpen, file]);

    if (!file) return null;

    const isPdf = file.name.toLowerCase().endsWith('.pdf');

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0" onClick={(e) => e.stopPropagation()}>
                <DialogHeader className="px-6 py-4 border-b bg-background z-10" dir="ltr">
                    <DialogTitle>{file.name}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 w-full h-full relative bg-muted/20">
                    {isLoading && !error && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                            <LoaderIcon className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                            <AlertCircle className="w-12 h-12" />
                            <p>{error}</p>
                        </div>
                    )}

                    {previewUrl && (
                        <iframe
                            src={previewUrl}
                            className="w-full h-full border-0"
                            onLoad={() => setIsLoading(false)}
                            title="File Preview"
                            sandbox={isPdf ? undefined : "allow-scripts allow-same-origin allow-popups allow-forms"}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
