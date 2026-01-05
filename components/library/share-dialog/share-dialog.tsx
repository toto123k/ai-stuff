"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import useSWR, { mutate } from "swr";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { LoaderIcon, PlusIcon } from "lucide-react";

import { ShareDialogProps, Permission, SearchUser, EditablePermission, PermType, PERM_LEVELS } from "./types";
import { useDebounce } from "./hooks";
import { UserSearch } from "./user-search";
import { SelectedUsersBadges } from "./selected-users-badges";
import { PermissionRow } from "./permission-row";

export const ShareDialog = ({ isOpen, onClose, item }: ShareDialogProps) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedUsers, setSelectedUsers] = useState<SearchUser[]>([]);
    const [newPermission, setNewPermission] = useState<EditablePermission>("read");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const [pendingUpdates, setPendingUpdates] = useState<Map<string, EditablePermission>>(new Map());
    const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const [isAddingUsers, setIsAddingUsers] = useState(false);
    const debouncedSearchQuery = useDebounce(searchQuery, 300);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setIsSearchOpen(false);
            }
        };
        if (isSearchOpen) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isSearchOpen]);

    // Data fetching
    const { data: permissions, isLoading } = useSWR<Permission[]>(
        isOpen && item ? `/api/fs/permissions?folderId=${item.id}` : null,
        async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error((await res.json()).error || "Failed to fetch");
            return res.json();
        }
    );

    const { data: searchResults, isLoading: isSearchLoading } = useSWR<SearchUser[]>(
        debouncedSearchQuery.length >= 2 ? `/api/users/search?q=${encodeURIComponent(debouncedSearchQuery)}` : null,
        async (url: string) => {
            const res = await fetch(url);
            return res.ok ? res.json() : [];
        }
    );

    const filteredSearchResults = useMemo(() => {
        if (!searchResults) return [];
        const selectedIds = new Set(selectedUsers.map((u) => u.id));
        const directIds = new Set(permissions?.filter((p) => p.isDirect).map((p) => p.userId) || []);
        return searchResults.filter((u) => !selectedIds.has(u.id) && !directIds.has(u.id));
    }, [searchResults, selectedUsers, permissions]);

    const sortedPermissions = useMemo(() =>
        permissions?.slice().sort((a, b) => a.email.localeCompare(b.email)) || [],
        [permissions]
    );

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery("");
            setSelectedUsers([]);
            setNewPermission("read");
            setPendingUpdates(new Map());
            setPendingDeletes(new Set());
            setIsSearchOpen(false);
        }
    }, [isOpen]);

    const hasChanges = pendingUpdates.size > 0 || pendingDeletes.size > 0;

    // Handlers
    const handleSelectUser = useCallback((user: SearchUser) => {
        setSelectedUsers((prev) => [...prev, user]);
        setSearchQuery("");
        setIsSearchOpen(false);
    }, []);

    const handleRemoveSelectedUser = useCallback((userId: string) => {
        setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
    }, []);

    const handleAddPermissionForUser = useCallback(async (userId: string, permission: EditablePermission) => {
        if (!item) return;
        try {
            const res = await fetch("/api/fs/permissions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetUserId: userId, folderId: item.id, permission }),
            });
            if (res.ok) {
                toast.success("הרשאה עודכנה בהצלחה");
                mutate(`/api/fs/permissions?folderId=${item.id}`);
            } else {
                toast.error((await res.json()).error || "שגיאה בעדכון הרשאה");
            }
        } catch {
            toast.error("שגיאה בעדכון הרשאה");
        }
    }, [item]);

    const handlePermissionChange = useCallback((userId: string, newPerm: EditablePermission, isInherited: boolean) => {
        if (isInherited) {
            handleAddPermissionForUser(userId, newPerm);
        } else {
            const current = permissions?.find((p) => p.userId === userId)?.permission;
            if (current === newPerm) {
                setPendingUpdates((prev) => { const n = new Map(prev); n.delete(userId); return n; });
            } else {
                setPendingUpdates((prev) => new Map(prev).set(userId, newPerm));
            }
        }
    }, [permissions, handleAddPermissionForUser]);

    const handleToggleDelete = useCallback((userId: string) => {
        setPendingDeletes((prev) => {
            const n = new Set(prev);
            n.has(userId) ? n.delete(userId) : n.add(userId);
            return n;
        });
        setPendingUpdates((prev) => { const n = new Map(prev); n.delete(userId); return n; });
    }, []);

    const handleAddUsers = async () => {
        if (!item || selectedUsers.length === 0) return;
        setIsAddingUsers(true);
        try {
            const results = await Promise.allSettled(
                selectedUsers.map((user) =>
                    fetch("/api/fs/permissions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ targetUserId: user.id, folderId: item.id, permission: newPermission }),
                    })
                )
            );
            const success = results.filter((r) => r.status === "fulfilled").length;
            if (success > 0) {
                toast.success(`נוספו ${success} משתמשים בהצלחה`);
                mutate(`/api/fs/permissions?folderId=${item.id}`);
            }
            if (results.length - success > 0) toast.error(`נכשלה הוספת ${results.length - success} משתמשים`);
            setSelectedUsers([]);
        } finally {
            setIsAddingUsers(false);
        }
    };

    const handleSaveChanges = async () => {
        if (!item) return;
        setIsSaving(true);
        try {
            const updates = Array.from(pendingUpdates.entries()).map(([userId, permission]) =>
                fetch("/api/fs/permissions", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ targetUserId: userId, folderId: item.id, permission }),
                })
            );
            const deletes = Array.from(pendingDeletes).map((userId) =>
                fetch("/api/fs/permissions", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ targetUserId: userId, folderId: item.id }),
                })
            );
            const results = await Promise.allSettled([...updates, ...deletes]);
            const success = results.filter((r) => r.status === "fulfilled").length;
            if (success > 0) {
                toast.success("הרשאות עודכנו בהצלחה");
                mutate(`/api/fs/permissions?folderId=${item.id}`);
                setPendingUpdates(new Map());
                setPendingDeletes(new Set());
            }
            if (results.length - success > 0) toast.error(`נכשלו ${results.length - success} עדכונים`);
        } finally {
            setIsSaving(false);
        }
    };

    const getDisplayPermission = (userId: string, original: PermType) =>
        pendingDeletes.has(userId) ? original : (pendingUpdates.get(userId) || original);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-xl pt-10" dir="rtl">
                <DialogHeader>
                    <DialogTitle>שתף את {item?.name}</DialogTitle>
                    <DialogDescription>חפש משתמשים לפי אימייל או מזהה כדי לשתף איתם את הפריט.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* User Search */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">הוסף משתמשים</label>
                        <UserSearch
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            isSearchOpen={isSearchOpen}
                            setIsSearchOpen={setIsSearchOpen}
                            searchContainerRef={searchContainerRef as React.RefObject<HTMLDivElement>}
                            isSearchLoading={isSearchLoading}
                            filteredResults={filteredSearchResults}
                            debouncedQuery={debouncedSearchQuery}
                            onSelectUser={handleSelectUser}
                            newPermission={newPermission}
                            setNewPermission={setNewPermission}
                        />
                        {selectedUsers.length > 0 && (
                            <>
                                <SelectedUsersBadges users={selectedUsers} onRemove={handleRemoveSelectedUser} />
                                <Button onClick={handleAddUsers} disabled={isAddingUsers} size="sm" className="mt-2">
                                    {isAddingUsers ? <LoaderIcon className="animate-spin h-4 w-4 ml-2" /> : <PlusIcon className="h-4 w-4 ml-2" />}
                                    הוסף {selectedUsers.length} משתמשים
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Permissions Table */}
                    <div className="border rounded-md">
                        <div className="p-2 bg-muted/50 border-b text-sm font-medium flex items-center justify-between">
                            <span>משתמשים עם גישה</span>
                            {hasChanges && <Badge variant="outline" className="text-xs">יש שינויים שלא נשמרו</Badge>}
                        </div>
                        <ScrollArea className="h-[350px]">
                            {isLoading ? (
                                <div className="p-4 space-y-2">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                </div>
                            ) : sortedPermissions.length === 0 ? (
                                <div className="p-4 text-center text-sm text-muted-foreground">אין משתמשים נוספים עם גישה</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-right">משתמש</TableHead>
                                            <TableHead className="text-right w-[120px]">הרשאה</TableHead>
                                            <TableHead className="text-right w-[60px]">פעולות</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedPermissions.map((p) => {
                                            const canDelete = p.isDirect && p.permission !== "owner";
                                            const isMarkedForDelete = canDelete && pendingDeletes.has(p.userId);
                                            const displayPerm = p.isDirect ? getDisplayPermission(p.userId, p.permission) : p.permission;
                                            const hasChanged = p.isDirect && (pendingUpdates.has(p.userId) || isMarkedForDelete);
                                            const minPermLevel = p.inheritedPermission ? PERM_LEVELS[p.inheritedPermission] : 0;

                                            return (
                                                <PermissionRow
                                                    key={`${p.userId}-${p.folderId}`}
                                                    permission={p}
                                                    isMarkedForDelete={isMarkedForDelete}
                                                    hasChanged={hasChanged}
                                                    displayPerm={displayPerm}
                                                    minPermLevel={minPermLevel}
                                                    onPermissionChange={handlePermissionChange}
                                                    onToggleDelete={handleToggleDelete}
                                                />
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="sm:justify-between gap-2">
                    <Button type="button" variant="secondary" onClick={onClose}>סגור</Button>
                    {hasChanges && (
                        <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving && <LoaderIcon className="animate-spin h-4 w-4 ml-2" />}
                            שמור שינויים
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
