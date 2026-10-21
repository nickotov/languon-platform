import {
    ArchiveTextDialog,
    MoveTextDialog,
    RenameTextDialog,
    TextShareDialog,
} from '@/fsd/features/text-management';
import type { TextWorkspace } from '../../hooks/use-text-workspace';
export type WorkspaceManagementKind =
    'rename' | 'share' | 'archive' | 'move' | null;
export function WorkspaceManagement({
    ws,
    kind,
    onClose,
    onLeave,
}: {
    ws: TextWorkspace;
    kind: WorkspaceManagementKind;
    onClose(): void;
    onLeave(): void;
}) {
    if (!ws.document) return null;
    return (
        <>
            {kind === 'move' && (
                <MoveTextDialog
                    document={ws.document}
                    onClose={onClose}
                    onSaved={ws.adopt}
                    requestWithSession={ws.requestWithSession}
                />
            )}
            <RenameTextDialog
                open={kind === 'rename'}
                document={ws.document}
                onClose={onClose}
                onSaved={ws.updateMetadata}
                requestWithSession={ws.requestWithSession}
            />
            <ArchiveTextDialog
                open={kind === 'archive'}
                kind='text'
                resource={ws.document}
                onClose={onClose}
                onSaved={onLeave}
                requestWithSession={ws.requestWithSession}
            />
            <TextShareDialog
                open={kind === 'share'}
                kind='text'
                resource={ws.document}
                onClose={onClose}
                onChanged={ws.refreshMetadata}
                requestWithSession={ws.requestWithSession}
            />
        </>
    );
}
