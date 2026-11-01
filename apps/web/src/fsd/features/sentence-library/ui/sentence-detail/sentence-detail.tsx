import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ArrowLeftIcon, XIcon } from 'lucide-react';
import {
    Button,
    Dialog,
    IconButton,
    InlineAlert,
    Skeleton,
} from '@/fsd/shared/ui';
import { useInterfaceText } from '../../hooks/use-interface-text';
import { useIsCompact } from '../../hooks/use-is-compact';
import { LibraryApiError } from '../../api/library-api';
import { displayDetail } from '../../lib/sentence-display';
import type { LibraryApi, SavedSentence } from '../../types';
import styles from './sentence-detail.module.css';
import { SentenceDetailContent } from './sentence-detail-content';
export function SentenceDetail({
    api,
    id,
    identity,
    onClose,
    onArchiveToggle,
    locked,
    renderAudio,
}: {
    api: LibraryApi;
    id: string;
    identity: string;
    onClose(): void;
    onArchiveToggle(sentence: SavedSentence): void;
    locked: boolean;
    renderAudio?:
        | ((exerciseId: string, field: 'prompt' | 'reference') => ReactNode)
        | undefined;
}) {
    const { L } = useInterfaceText();
    const compact = useIsCompact();
    const [expanded, setExpanded] = useState(false);
    const query = useQuery({
        queryKey: ['sentence-library', identity, 'detail', id],
        queryFn: () => api.detail(id),
        retry: false,
        gcTime: 0,
        staleTime: 0,
    });
    const sentence = query.data ? displayDetail(query.data) : null;
    function retry() {
        void query.refetch();
    }

    function toggle() {
        setExpanded((value) => !value);
    }

    function archive() {
        if (sentence) {
            onArchiveToggle(sentence);
        }
    }

    let content;
    if (query.isPending) {
        content = (
            <div
                role='status'
                aria-label={L('loading')}
                className={styles.loadingState}
            >
                <Skeleton variant='rect' width='90%' height='1.75rem' />
                <Skeleton variant='rect' width='50%' height='1rem' />
                <Skeleton variant='rect' width='100%' height='7rem' />
            </div>
        );
    } else if (
        query.error instanceof LibraryApiError &&
        [401, 403, 404].includes(query.error.status)
    ) {
        content = (
            <div className={styles.statusContent}>
                <InlineAlert
                    tone='info'
                    title={L('detailRemovedTitle')}
                    actions={
                        <Button
                            size='compact'
                            variant='secondary'
                            onClick={onClose}
                        >
                            {L('backToList')}
                        </Button>
                    }
                >
                    {L('detailRemovedBody')}
                </InlineAlert>
            </div>
        );
    } else if (query.isError) {
        content = (
            <div className={styles.statusContent}>
                <InlineAlert
                    tone='error'
                    title={L('detailLoadFailed')}
                    actions={
                        <Button
                            size='compact'
                            variant='secondary'
                            onClick={retry}
                        >
                            {L('retry')}
                        </Button>
                    }
                >
                    {L('loadFailedBody')}
                </InlineAlert>
            </div>
        );
    } else if (sentence) {
        content = (
            <SentenceDetailContent
                sentence={sentence}
                id={id}
                expanded={expanded}
                onToggle={toggle}
                onArchive={archive}
                locked={locked}
                renderAudio={renderAudio}
            />
        );
    }

    const closeIcon = compact ? (
        <ArrowLeftIcon aria-hidden className={styles.icon} />
    ) : (
        <XIcon aria-hidden className={styles.icon} />
    );

    return (
        <Dialog
            open
            size='viewport'
            showHeader={false}
            title={L('detailTitle')}
            onClose={onClose}
            className={styles.drawer!}
            bodyClassName={styles.body}
            closeLabel={L('close')}
        >
            <div className={styles.drawerHeader}>
                {compact ? (
                    <IconButton
                        size='sm'
                        variant='ghost'
                        label={L('back')}
                        icon={closeIcon}
                        onClick={onClose}
                    />
                ) : null}
                <h2 className={styles.drawerHeading}>{L('detailTitle')}</h2>
                {!compact ? (
                    <IconButton
                        size='sm'
                        variant='ghost'
                        label={L('close')}
                        icon={closeIcon}
                        onClick={onClose}
                    />
                ) : null}
            </div>
            {content}
        </Dialog>
    );
}
