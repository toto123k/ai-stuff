import { FSObject, FSObjectActions } from "./types";
import { FolderCard } from "./folder-card";

interface FoldersGridProps {
    folders: FSObject[];
    onNavigate: (id: number, name: string) => void;
    actions: FSObjectActions;
}

export const FoldersGrid = ({ folders, onNavigate, actions }: FoldersGridProps) => {
    if (folders.length === 0) return null;

    return (
        <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
                תיקיות ({folders.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {folders.map(folder => (
                    <FolderCard
                        key={folder.id}
                        folder={folder}
                        onNavigate={onNavigate}
                        actions={actions}
                    />
                ))}
            </div>
        </div>
    );
};
