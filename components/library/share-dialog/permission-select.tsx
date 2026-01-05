"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EditablePermission, PermType, PERMISSION_LABELS, PERM_LEVELS, EDITABLE_PERMISSIONS } from "./types";

interface PermissionSelectProps {
    value: string;
    onChange: (v: EditablePermission) => void;
    disabled?: boolean;
    minPermLevel: number;
    inheritedFolderName: string;
}

export const PermissionSelect = ({ value, onChange, disabled, minPermLevel, inheritedFolderName }: PermissionSelectProps) => (
    <TooltipProvider delayDuration={100}>
        <Select value={value} onValueChange={(v) => onChange(v as EditablePermission)} disabled={disabled}>
            <SelectTrigger className="h-8 w-full">
                <SelectValue>{PERMISSION_LABELS[value as PermType]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
                {EDITABLE_PERMISSIONS.map((perm) => {
                    const isDisabled = PERM_LEVELS[perm] < minPermLevel;
                    return isDisabled ? (
                        <Tooltip key={perm}>
                            <TooltipTrigger asChild>
                                <div className="relative flex cursor-not-allowed select-none items-center rounded-sm px-2 py-1.5 text-sm opacity-50">
                                    {PERMISSION_LABELS[perm]}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                                <p>למשתמש יש הרשאה גבוהה יותר בתיקייה {inheritedFolderName}</p>
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <SelectItem key={perm} value={perm}>{PERMISSION_LABELS[perm]}</SelectItem>
                    );
                })}
            </SelectContent>
        </Select>
    </TooltipProvider>
);
