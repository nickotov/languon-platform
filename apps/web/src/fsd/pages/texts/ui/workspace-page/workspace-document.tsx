import { TextReading } from '@/fsd/features/text-reading';
import type { TextWorkspace } from '../../hooks/use-text-workspace';
import { workspaceReadingDocument } from '../../lib/workspace-reading';
import { WorkspaceBanners } from './workspace-banners';
import { WorkspaceCompose } from './workspace-compose';
import { WorkspacePairEditor } from './workspace-pair-editor';
import styles from './workspace-page.module.css';

export function WorkspaceDocument({
    ws,
    actorId,
    match,
}: {
    ws: TextWorkspace;
    actorId: string;
    match: boolean;
}) {
    const { readingDocument, readingSource } = workspaceReadingDocument(ws);
    const showRead =
        Boolean(readingDocument?.alignment) &&
        (ws.mode === 'read' || Boolean(ws.proposal));
    const showCompose = !showRead && ws.mode !== 'edit';
    return (
        <main className={styles.body} id='reader-workspace'>
            {showCompose && <WorkspaceCompose ws={ws} />}
            {ws.mode === 'edit' && !ws.proposal && (
                <>
                    <WorkspaceBanners ws={ws} />
                    <WorkspacePairEditor ws={ws} />
                </>
            )}
            {showRead && readingDocument && (
                <TextReading
                    collectionActorKey={actorId}
                    document={readingDocument}
                    source={readingSource}
                    requestWithSession={ws.requestWithSession}
                    matchMode={match}
                    previewExpired={ws.previewExpired}
                    topSlot={<WorkspaceBanners ws={ws} />}
                />
            )}
        </main>
    );
}
