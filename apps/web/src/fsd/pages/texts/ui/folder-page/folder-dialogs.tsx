import type { TextDocument, TextFolder } from '@languon/contracts';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
import {
    MoveTextDialog,
    ArchiveTextDialog,
    FolderFormDialog,
    RenameTextDialog,
    TextShareDialog,
} from '@/fsd/features/text-management';
import type { FolderAction } from './folder-header';
import type { TextRowAction } from './text-row';

export type FolderDialog =
    | { type: FolderAction }
    | { type: TextRowAction; document: TextDocument }
    | null;

export function FolderDialogs({
    folder,
    dialog,
    onClose,
    onSaved,
    onFolderArchived,
    onChanged,
    requestWithSession,
}: {
    folder: TextFolder;
    dialog: FolderDialog;
    onClose(): void;
    onSaved(): void;
    onFolderArchived(): void;
    onChanged(): Promise<void>;
    requestWithSession: RequestWithTextSession;
}) {
    const textDialog = dialog && 'document' in dialog ? dialog : null;

    return (
        <>
            <FolderFormDialog
                open={dialog?.type === 'edit-folder'}
                initial={folder}
                onClose={onClose}
                onSaved={onSaved}
                requestWithSession={requestWithSession}
            />
            {dialog?.type === 'archive-folder' && (
                <ArchiveTextDialog
                    open
                    kind='folder'
                    resource={folder}
                    onClose={onClose}
                    onSaved={onFolderArchived}
                    requestWithSession={requestWithSession}
                />
            )}
            {dialog?.type === 'share-folder' && (
                <TextShareDialog
                    open
                    kind='folder'
                    resource={folder}
                    onClose={onClose}
                    onChanged={onChanged}
                    requestWithSession={requestWithSession}
                />
            )}
            {textDialog?.type === 'move-text' && (
                <MoveTextDialog
                    document={textDialog.document}
                    onClose={onClose}
                    onSaved={onSaved}
                    requestWithSession={requestWithSession}
                />
            )}
            {textDialog?.type === 'rename' && (
                <RenameTextDialog
                    open
                    document={textDialog.document}
                    onClose={onClose}
                    onSaved={onSaved}
                    requestWithSession={requestWithSession}
                />
            )}
            {textDialog?.type === 'archive-text' && (
                <ArchiveTextDialog
                    open
                    kind='text'
                    resource={textDialog.document}
                    onClose={onClose}
                    onSaved={onSaved}
                    requestWithSession={requestWithSession}
                />
            )}
            {textDialog?.type === 'share-text' && (
                <TextShareDialog
                    open
                    kind='text'
                    resource={textDialog.document}
                    onClose={onClose}
                    onChanged={onChanged}
                    requestWithSession={requestWithSession}
                />
            )}
        </>
    );
}
