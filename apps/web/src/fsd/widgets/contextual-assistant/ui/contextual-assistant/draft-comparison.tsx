import { KnowledgeDocumentView } from '@/fsd/features/knowledge-notes';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { KnowledgeNoteContent } from '@languon/contracts';
import {
    conversationCopy,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import styles from './knowledge-draft-card.module.css';

export function DraftComparison({
    noteId,
    content,
    request,
}: {
    noteId: string;
    content: KnowledgeNoteContent;
    request: ConversationSessionRequest;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const [open, setOpen] = useState(false);
    const latest = useQuery({
        queryKey: ['tutor-note-comparison', noteId],
        queryFn: ({ signal }) =>
            request((token) => knowledgeApi.read(token, noteId, signal)),
        enabled: open,
        gcTime: 0,
        retry: false,
    });
    function toggle() {
        setOpen((value) => !value);
    }
    function retry() {
        void latest.refetch();
    }
    return (
        <div>
            <Button
                size='compact'
                variant='secondary'
                onClick={toggle}
                aria-expanded={open}
            >
                {copy.compare}
            </Button>
            {open && latest.isPending && <p role='status'>{copy.loading}</p>}
            {open && latest.isError && (
                <div role='alert'>
                    <p>{copy.error}</p>
                    <Button size='compact' onClick={retry}>
                        {copy.retry}
                    </Button>
                </div>
            )}
            {open && latest.data && (
                <div className={styles.comparison}>
                    <section>
                        <h4>{copy.savedContext}</h4>
                        <h3>{latest.data.title}</h3>
                        <p>{latest.data.summary}</p>
                        <KnowledgeDocumentView body={latest.data.body} />
                    </section>
                    <section>
                        <h4>{copy.draft}</h4>
                        <h3>{content.title}</h3>
                        <p>{content.summary}</p>
                        <KnowledgeDocumentView body={content.body} />
                    </section>
                </div>
            )}
        </div>
    );
}
