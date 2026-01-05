"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchIcon, UserIcon } from "lucide-react";
import { SearchUser, EditablePermission, PERMISSION_LABELS, EDITABLE_PERMISSIONS } from "./types";

interface UserSearchProps {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    isSearchOpen: boolean;
    setIsSearchOpen: (open: boolean) => void;
    searchContainerRef: React.RefObject<HTMLDivElement>;
    isSearchLoading: boolean;
    filteredResults: SearchUser[];
    debouncedQuery: string;
    onSelectUser: (user: SearchUser) => void;
    newPermission: EditablePermission;
    setNewPermission: (p: EditablePermission) => void;
}

export const UserSearch = ({
    searchQuery, setSearchQuery, isSearchOpen, setIsSearchOpen,
    searchContainerRef, isSearchLoading, filteredResults, debouncedQuery,
    onSelectUser, newPermission, setNewPermission
}: UserSearchProps) => (
    <div className="flex items-center gap-2">
        <div ref={searchContainerRef} className="relative flex-1">
            <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
                value={searchQuery}
                onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(e.target.value.length >= 2);
                }}
                onFocus={() => searchQuery.length >= 2 && setIsSearchOpen(true)}
                placeholder="חפש לפי אימייל או מזהה..."
                className="pr-9 text-right"
                dir="ltr"
            />
            {isSearchOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-md">
                    <ScrollArea className="h-[200px]">
                        {isSearchLoading ? (
                            <div className="p-2 space-y-2">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : filteredResults.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                                {debouncedQuery.length < 2 ? "הקלד לפחות 2 תווים" : "לא נמצאו משתמשים"}
                            </div>
                        ) : (
                            <div className="p-1">
                                {filteredResults.map((user) => (
                                    <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => onSelectUser(user)}
                                        className="w-full flex items-center gap-2 p-2 hover:bg-muted rounded-md text-right"
                                    >
                                        <div className="bg-primary/10 p-1.5 rounded-full">
                                            <UserIcon className="h-3 w-3 text-primary" />
                                        </div>
                                        <span className="text-sm truncate" dir="ltr">{user.email}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            )}
        </div>
        <Select value={newPermission} onValueChange={(v) => setNewPermission(v as EditablePermission)}>
            <SelectTrigger className="w-[100px]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {EDITABLE_PERMISSIONS.map((p) => (
                    <SelectItem key={p} value={p}>{PERMISSION_LABELS[p]}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    </div>
);
