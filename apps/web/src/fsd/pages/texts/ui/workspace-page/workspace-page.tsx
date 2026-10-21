'use client';
import type { MoveTextRequest } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { TextsAuthBoundary } from '@/fsd/features/text-management';
import { TextWorkspace } from './text-workspace';
export function TextWorkspacePage({
    folderId = null,
    textId,
    sharedFolderConfirmation,
}: {
    sharedFolderConfirmation?: MoveTextRequest['sharedFolderConfirmation'];
    folderId?: string | null;
    textId?: string;
}) {
    const actorId = useSessionStore((state) => state.user?.id);

    return (
        <TextsAuthBoundary
            returnTo={
                textId
                    ? `/texts/${textId}`
                    : `/texts/new${folderId ? `?folderId=${folderId}` : ''}`
            }
        >
            <TextWorkspace
                key={`${actorId}/${folderId}/${textId ?? 'new'}`}
                actorId={actorId ?? ''}
                folderId={folderId}
                {...(sharedFolderConfirmation
                    ? { sharedFolderConfirmation }
                    : {})}
                {...(textId ? { textId } : {})}
            />
        </TextsAuthBoundary>
    );
}
