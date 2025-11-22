"use client";

import { useAtom } from "jotai";
import { uploadsAtom, removeUploadAtom, isUploadsOpenAtom } from "@/lib/store/upload-store";
import { X, Check, AlertCircle, ChevronDown, ChevronUp, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";

export function UploadProgress() {
    const [uploads, setUploads] = useAtom(uploadsAtom);
    const [isOpen, setIsOpen] = useAtom(isUploadsOpenAtom);
    const [, removeUpload] = useAtom(removeUploadAtom);

    if (uploads.length === 0) return null;

    // Check if all uploads are in a final state (completed or error)
    const isFinished = uploads.every(u => u.status === 'completed' || u.status === 'error');
    const completedCount = uploads.filter(u => u.status === 'completed').length;

    // Only considered "Success" if everything finished and no errors (for the green checkmark)
    const isAllSuccess = completedCount === uploads.length;

    return (
        <div className="fixed bottom-4 left-4 w-80 z-50" dir="rtl">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <Card className="shadow-xl border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <CardHeader className="p-0">
                        <div className="flex items-center justify-between p-3 pl-2 bg-muted/50 hover:bg-muted/80 transition-colors">
                            <CollapsibleTrigger asChild className="flex-1 flex items-center gap-3 cursor-pointer select-none">
                                <div>
                                    <div className={`p-1 rounded-full ${isAllSuccess ? 'bg-green-500' : 'bg-primary'} text-primary-foreground transition-colors duration-300`}>
                                        {isAllSuccess ? <Check className="w-4 h-4 text-white" /> : <ChevronUp className="w-4 h-4" />}
                                    </div>
                                    <span className="text-sm font-medium">{isFinished ? "ההעלאה הסתיימה" : `מעלה ${uploads.length - completedCount} פריטים`}</span>
                                </div>
                            </CollapsibleTrigger>
                            <div className="flex gap-1">
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                                    </Button>
                                </CollapsibleTrigger>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={!isFinished} // Disabled until all done/failed
                                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                                    onClick={() => isFinished && setUploads([])}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>

                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                        <Separator />
                        <ScrollArea className="max-h-[280px]">
                            <div className="p-2">
                                <AnimatePresence mode="popLayout" initial={false}>
                                    {uploads.map((u) => (
                                        <motion.div
                                            layout
                                            key={u.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
                                            transition={{ type: "spring", damping: 20, stiffness: 300 }}
                                            className="relative flex items-center gap-3 p-2 mb-1 rounded-lg hover:bg-accent/50 group overflow-hidden"
                                        >
                                            <div className={`shrink-0 h-8 w-8 flex items-center justify-center rounded-full ${u.status === 'completed' ? 'bg-green-500/15' : u.status === 'error' ? 'bg-destructive/15' : 'bg-muted/50'}`}>
                                                {u.status === 'completed' ? <Check className="w-4 h-4 text-green-600" /> : u.status === 'error' ? <AlertCircle className="w-4 h-4 text-destructive" /> : <FileIcon className="w-4 h-4 text-muted-foreground" />}
                                            </div>
                                            <div className="flex-1 min-w-0 space-y-1.5">
                                                <div className="flex justify-between gap-2">
                                                    <span className="text-sm font-medium truncate">{u.file.name}</span>
                                                    {/* Individual remove X is still clickable if you want to cancel a specific file */}
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeUpload(u.id)}><X className="h-3.5 w-3.5" /></Button>
                                                </div>
                                                {(u.status === 'uploading' || u.status === 'pending') && (
                                                    <div className="space-y-1">
                                                        <Progress value={u.progress} className="h-1.5" />
                                                        <div className="flex justify-between text-[10px] text-muted-foreground uppercase"><span>{u.status === 'pending' ? 'ממתין' : 'מעלה...'}</span><span>{u.progress}%</span></div>
                                                    </div>
                                                )}
                                                {u.status === 'error' && <p className="text-[10px] text-destructive font-medium">נכשל</p>}
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </ScrollArea>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </div>
    );
}