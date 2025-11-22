import { ContextMenuItem } from "@/components/ui/context-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ProtectedMenuItemProps {
    children: React.ReactNode;
    onClick: () => void;
    disabled: boolean;
    tooltipText?: string;
    className?: string;
}

export const ProtectedMenuItem = ({
    children,
    onClick,
    disabled,
    tooltipText = "אין לך הרשאות לבצע פעולה זו",
    className
}: ProtectedMenuItemProps) => {
    if (disabled) {
        return (
            <TooltipProvider>
                <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                        <div className="w-full outline-none">
                            <ContextMenuItem disabled className={cn("opacity-50 cursor-not-allowed", className)}>
                                {children}
                            </ContextMenuItem>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                        <p>{tooltipText}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <ContextMenuItem onClick={onClick} className={className}>
            {children}
        </ContextMenuItem>
    );
};
