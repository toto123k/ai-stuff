"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import useSWR, { mutate } from "swr";
import { LoaderIcon, UploadIcon, PlusIcon, BanIcon } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { FSObject, FSObjectActions } from "./library/types";
import { LibraryHeader } from "./library/library-header";
import { FoldersGrid } from "./library/folders-grid";
import { FilesTable } from "./library/files-table";
import { CreateFolderDialog } from "./library/create-folder-dialog";
import { RenameDialog } from "./library/rename-dialog";
import { DeleteDialog } from "./library/delete-dialog";
import { ShareDialog } from "./library/share-dialog";

export function LibraryView({ userId }: { userId: string }) {
  // 1. Added "shared" to the type definition
  const [activeRootType, setActiveRootType] = useState<"personal" | "organizational" | "shared">("personal");
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: number | null, name: string }[]>([
    { id: null, name: "אישי" }
  ]);

  // Dialog states
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [selectedObject, setSelectedObject] = useState<FSObject | null>(null);
  const [newItemName, setNewItemName] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 2. Helper to determine if we are in a read-only root (Org or Shared root)
  const isReadOnlyRoot = currentFolderId === null && activeRootType !== "personal";

  // 3. Updated SWR fetch key logic to include shared
  const { data, error, isLoading } = useSWR<FSObject[] | { objects: FSObject[], rootFolderId: number | null }>(
    currentFolderId
      ? `/api/fs/folders/${currentFolderId}`
      : activeRootType === "personal"
        ? "/api/fs/personal"
        : activeRootType === "shared"
          ? "/api/fs/shared"
          : "/api/fs/org",
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    }
  );

  // Extract objects from response (handle both array and object formats)
  const objects = Array.isArray(data) ? data : data?.objects || [];

  useEffect(() => {
    if (activeRootType === "personal" && !Array.isArray(data) && data?.rootFolderId && currentFolderId === null) {
      setCurrentFolderId(data.rootFolderId);
      setBreadcrumbs([{ id: data.rootFolderId, name: "אישי" }]);
    }
  }, [data, activeRootType, currentFolderId]);

  const getCurrentMutateKey = () =>
    currentFolderId
      ? `/api/fs/folders/${currentFolderId}`
      : activeRootType === "personal"
        ? "/api/fs/personal"
        : activeRootType === "shared"
          ? "/api/fs/shared"
          : "/api/fs/org";

  const handleNavigate = (folderId: number, name: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumbs(prev => [...prev, { id: folderId, name }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const target = breadcrumbs[index];
    setCurrentFolderId(target.id);
    setBreadcrumbs(prev => prev.slice(0, index + 1));
  };

  // 4. Updated Root Type Change to handle labels including Shared
  const handleRootTypeChange = (type: "personal" | "organizational" | "shared") => {
    setActiveRootType(type);
    setCurrentFolderId(null);

    let label = "אישי";
    if (type === "organizational") label = "אירגונית";
    if (type === "shared") label = "משותף איתי";

    setBreadcrumbs([{ id: null, name: label }]);
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // 5. Block uploads if in read-only root
    if (isReadOnlyRoot) {
      toast.error("לא ניתן להעלות קבצים לתיקיית שורש משותפת או ארגונית");
      return;
    }

    console.log("Uploading files, currentFolderId:", currentFolderId);

    for (const file of acceptedFiles) {
      const formData = new FormData();
      formData.append("file", file);

      if (currentFolderId !== null) {
        formData.append("parentId", currentFolderId.toString());
      }

      formData.append("rootType", activeRootType);

      try {
        console.log("Sending upload request for:", file.name);
        const response = await fetch("/api/fs/files", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Upload failed: ${response.status}`);
        }

        toast.success(`העלאת ${file.name} הצליחה`);
      } catch (e) {
        console.error("Upload error:", e);
        toast.error(`העלאת ${file.name} נכשלה`);
      }
    }
    mutate(getCurrentMutateKey());
  }, [currentFolderId, activeRootType, isReadOnlyRoot]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    disabled: isReadOnlyRoot // Disable dropzone logic entirely in read-only
  });

  const handleCreateFolder = async () => {
    if (isReadOnlyRoot) {
      toast.error("אין הרשאות ליצירת תיקייה כאן");
      return;
    }

    if (!newItemName.trim()) {
      toast.error("אנא הזן שם לתיקייה");
      return;
    }

    try {
      const payload: any = {
        name: newItemName.trim(),
        rootType: activeRootType
      };

      if (currentFolderId !== null) {
        payload.parentId = currentFolderId;
      }

      const res = await fetch("/api/fs/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Failed to create folder`);

      mutate(getCurrentMutateKey());
      setIsCreateFolderOpen(false);
      setNewItemName("");
      toast.success("התיקייה נוצרה בהצלחה");
    } catch (e) {
      toast.error("יצירת התיקייה נכשלה");
    }
  };

  const handleRename = async () => {
    if (!selectedObject || !newItemName.trim()) return;
    // Optional: Block renaming if strictly in root of shared/org (though usually root items are folders you can't rename anyway)
    try {
      const endpoint = selectedObject.type === 'folder'
        ? `/api/fs/folders/${selectedObject.id}`
        : `/api/fs/files/${selectedObject.id}`;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newItemName.trim() }),
      });

      if (!res.ok) throw new Error("Failed");
      mutate(getCurrentMutateKey());
      setIsRenameOpen(false);
      setNewItemName("");
      toast.success("שינוי השם הצליח");
    } catch (e) {
      toast.error("שינוי השם נכשל");
    }
  };

  const handleDelete = async () => {
    if (!selectedObject) return;
    // 6. Block delete if strictly in root of shared/org (depends if you want to allow removing the share itself)
    // For now, assuming standard file operations:
    try {
      const endpoint = selectedObject.type === 'folder'
        ? `/api/fs/folders/${selectedObject.id}`
        : `/api/fs/files/${selectedObject.id}`;

      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      mutate(getCurrentMutateKey());
      setIsDeleteOpen(false);
      toast.success("המחיקה הצליחה");
    } catch (e) {
      toast.error("המחיקה נכשלה");
    }
  };

  const actions: FSObjectActions = {
    onRename: (obj) => {

      setSelectedObject(obj);
      setNewItemName(obj.name);
      setIsRenameOpen(true);
    },
    onDelete: (obj) => {

      setSelectedObject(obj);
      setIsDeleteOpen(true);
    },
    onShare: (obj) => {
      setSelectedObject(obj);
      setIsShareOpen(true);
    },
  };

  const folders = objects?.filter(o => o.type === "folder") || [];
  const files = objects?.filter(o => o.type === "file") || [];

  return (
    <DirectionProvider dir="rtl">
      <div className="flex flex-col h-full bg-background text-foreground" dir="rtl" {...getRootProps()}>
        <input {...getInputProps()} />

        <LibraryHeader
          activeRootType={activeRootType}
          onRootTypeChange={handleRootTypeChange}
          breadcrumbs={breadcrumbs}
          onBreadcrumbClick={handleBreadcrumbClick}
        />

        {/* Content Area */}
        <ContextMenu>
          <ContextMenuTrigger className="flex-1 p-6 overflow-y-auto">
            {isDragActive && !isReadOnlyRoot && (
              <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary z-50 flex items-center justify-center backdrop-blur-sm">
                <div className="text-xl font-medium text-primary">גרור קבצים כדי להעלות</div>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center h-full w-full">
                <LoaderIcon className="animate-spin w-6 h-6 text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-500">
                <FoldersGrid
                  folders={folders}
                  onNavigate={handleNavigate}
                  actions={actions}
                />
                <FilesTable
                  files={files}
                  actions={actions}
                  fileInputRef={fileInputRef}
                />
                {objects.length === 0 && (
                  <div className="text-center text-muted-foreground mt-20">
                    אין פריטים להצגה
                  </div>
                )}
              </div>
            )}
          </ContextMenuTrigger>

          {/* 7. Modified Background Context Menu */}
          <ContextMenuContent>
            {!isReadOnlyRoot ? (
              <>
                <ContextMenuItem onClick={() => fileInputRef.current?.click()}>
                  <UploadIcon className="w-4 h-4 ml-2" /> העלה קובץ
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                  setNewItemName("");
                  setIsCreateFolderOpen(true);
                }}>
                  <PlusIcon className="w-4 h-4 ml-2" /> צור תיקייה חדשה
                </ContextMenuItem>
              </>
            ) : (
              <ContextMenuItem disabled className="text-muted-foreground">
                <BanIcon className="w-4 h-4 ml-2" />
                אין אפשרות להוסיף קבצים כאן
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onDrop(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />

        {/* Dialogs */}
        <CreateFolderDialog
          isOpen={isCreateFolderOpen}
          onOpenChange={setIsCreateFolderOpen}
          onSubmit={handleCreateFolder}
          folderName={newItemName}
          setFolderName={setNewItemName}
        />

        <RenameDialog
          isOpen={isRenameOpen}
          onOpenChange={setIsRenameOpen}
          onSubmit={handleRename}
          object={selectedObject}
          newName={newItemName}
          setNewName={setNewItemName}
        />

        <DeleteDialog
          isOpen={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          onConfirm={handleDelete}
          object={selectedObject}
        />

        <ShareDialog
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          item={selectedObject}
        />
      </div>
    </DirectionProvider>
  );
}