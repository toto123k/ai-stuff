import { EditIcon, ShareIcon, TrashIcon, InfoIcon, CopyIcon, ScissorsIcon, ClipboardPasteIcon } from "lucide-react";
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { ProtectedMenuItem } from "./protected-menu-item";
import { FSObject, FSObjectActions } from "./types";
import { useAtom, useAtomValue } from "jotai";
import { fsObjectStatesAtom, canPasteAtom } from "@/lib/store/library-store";

interface FSObjectMenuProps {
    object: FSObject;
    actions: FSObjectActions;
    getSelectedFSObjects?: () => FSObject[];
}

export const FSObjectMenu = ({ object, actions, getSelectedFSObjects }: FSObjectMenuProps) => {
    console.log("FSObjectMenu object:", object.name, "permission:", object.permission);
    const canWrite = ['write', 'admin', "owner"].includes(object.permission || '');
    const canAdmin = ["owner", "admin"].includes(object.permission!);
    const [states, setStates] = useAtom(fsObjectStatesAtom);
    const canPaste = useAtomValue(canPasteAtom);

    // Count selected items to determine if we're in multi-select mode
    const selectedCount = Array.from(states.values()).filter(s => s.has("selected")).length;
    const isMultiSelect = selectedCount > 1;

    const handleCopyCut = (action: "copy" | "cut") => {
        setStates((prev) => {
            const next = new Map(prev);

            // 1. Clear ALL existing copy/cut states globally
            // This ensures we never have mixed states or multiple active copy/cut groups (unless we want additive, but standard is restrictive)
            for (const [id, state] of next.entries()) {
                if (state.has("copy") || state.has("cut")) {
                    const nextState = new Set(state);
                    nextState.delete("copy");
                    nextState.delete("cut");
                    if (nextState.size === 0) {
                        next.delete(id);
                    } else {
                        next.set(id, nextState);
                    }
                }
            }

            // 2. Determine targets
            // If the object we clicked on is "selected", then we act on ALL selected objects.
            // If it's NOT selected, we act ONLY on this object (standard OS behavior).
            const isClickedObjectSelected = next.get(object.id)?.has("selected");
            const targets = isClickedObjectSelected
                ? Array.from(next.entries()).filter(([_, s]) => s.has("selected")).map(([id]) => Number(id))
                : [object.id];

            // 3. Apply new state to targets
            targets.forEach(id => {
                const currentState = next.get(id) || new Set();
                const nextState = new Set(currentState);
                nextState.add(action);
                next.set(id, nextState);
            });

            return next;
        });
    };

    return (
        <ContextMenuContent>
            <ContextMenuItem onClick={() => handleCopyCut("copy")}>
                <CopyIcon className="ml-2 w-4 h-4" /> העתק
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleCopyCut("cut")}>
                <ScissorsIcon className="ml-2 w-4 h-4" /> גזור
            </ContextMenuItem>
            <ContextMenuItem onClick={() => actions.onPaste(object)} disabled={!canPaste}>
                <ClipboardPasteIcon className="ml-2 w-4 h-4" /> הדבק
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ProtectedMenuItem
                onClick={() => actions.onViewDetails(object)}
                disabled={isMultiSelect}
                tooltipText={isMultiSelect ? "לא ניתן לצפות בפרטים של מספר פריטים" : undefined}
            >
                <InfoIcon className="ml-2 w-4 h-4" /> פרטים
            </ProtectedMenuItem>

            <ProtectedMenuItem
                onClick={() => actions.onRename(object)}
                disabled={!canWrite || isMultiSelect}
                tooltipText={isMultiSelect ? "לא ניתן לשנות שם למספר פריטים בו-זמנית" : undefined}
            >
                <EditIcon className="ml-2 w-4 h-4" /> שנה שם
            </ProtectedMenuItem>

            <ProtectedMenuItem
                onClick={() => actions.onShare(object)}
                disabled={!canAdmin || isMultiSelect}
                tooltipText={isMultiSelect ? "לא ניתן לשתף מספר פריטים בו-זמנית" : undefined}
            >
                <ShareIcon className="ml-2 w-4 h-4" /> שתף
            </ProtectedMenuItem>

            <ProtectedMenuItem
                onClick={() => {
                    // Get all selected objects if getSelectedFSObjects is available
                    const allSelected = getSelectedFSObjects?.() ?? [];
                    actions.onDelete(object, allSelected);
                }}
                className="text-red-500 focus:text-red-500"
                disabled={!canWrite}
            >
                <TrashIcon className="ml-2 w-4 h-4" /> מחק
            </ProtectedMenuItem>
        </ContextMenuContent>
    );
};
