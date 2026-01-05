"use client";

import { Badge } from "@/components/ui/badge";
import { XIcon } from "lucide-react";
import { SearchUser } from "./types";

interface SelectedUsersBadgesProps {
    users: SearchUser[];
    onRemove: (id: string) => void;
}

export const SelectedUsersBadges = ({ users, onRemove }: SelectedUsersBadgesProps) => (
    <div className="flex flex-wrap gap-2 mt-2">
        {users.map((user) => (
            <Badge key={user.id} variant="secondary" className="flex items-center gap-1 py-1">
                <span dir="ltr" className="text-xs">{user.email}</span>
                <button type="button" onClick={() => onRemove(user.id)} className="hover:bg-muted rounded-full p-0.5">
                    <XIcon className="h-3 w-3" />
                </button>
            </Badge>
        ))}
    </div>
);
