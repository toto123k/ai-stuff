import { EditIcon, ShareIcon, TrashIcon } from "lucide-react";
import { ContextMenuContent } from "@/components/ui/context-menu";
import { ProtectedMenuItem } from "./protected-menu-item";
import { FSObject, FSObjectActions } from "./types";

interface FSObjectMenuProps {
    object: FSObject;
    actions: FSObjectActions;
}

export const FSObjectMenu = ({ object, actions }: FSObjectMenuProps) => {
    const canWrite = ['write', 'admin'].includes(object.permission || '');
    const canAdmin = object.permission === 'admin';

    return (
        <ContextMenuContent>
            <ProtectedMenuItem
                onClick={() => actions.onRename(object)}
                disabled={!canWrite}
            >
                <EditIcon className="ml-2 w-4 h-4" /> שנה שם
            </ProtectedMenuItem>

            <ProtectedMenuItem
                onClick={() => actions.onShare(object)}
                disabled={!canAdmin}
            >
                <ShareIcon className="ml-2 w-4 h-4" /> שתף
            </ProtectedMenuItem>

            <ProtectedMenuItem
                onClick={() => actions.onDelete(object)}
                className="text-red-500 focus:text-red-500"
                disabled={!canWrite}
            >
                <TrashIcon className="ml-2 w-4 h-4" /> מחק
            </ProtectedMenuItem>
        </ContextMenuContent>
    );
};
