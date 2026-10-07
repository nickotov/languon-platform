import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
    ArrowLeftIcon,
    XIcon,
    ChevronUpIcon,
    ChevronDownIcon,
} from 'lucide-react';
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
import {
    DirectionBadge,
    OwnershipMeta,
    StatusBadges,
} from '../sentence-badges/sentence-badges';
import { HintGroups } from '../hint-groups/hint-groups';
import styles from './sentence-detail.module.css';
import { SentenceStatus } from './sentence-status';
export function SentenceDetail({
    api,
    id,
    identity,
    onClose,
    onArchiveToggle,
    locked,
}: {
    api: LibraryApi;
    id: string;
    identity: string;
    onClose(): void;
    onArchiveToggle(sentence: SavedSentence): void;
    locked: boolean;
}) {
    const { L, lang } = useInterfaceText();
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
        if (sentence) onArchiveToggle(sentence);
    }
    let content;
    if (query.isPending)
        content = (
            <div
                role='status'
                aria-label={L('loading')}
                className='space-y-4 p-4'
            >
                <Skeleton variant='rect' width='90%' height='1.75rem' />
                <Skeleton variant='rect' width='50%' height='1rem' />
                <Skeleton variant='rect' width='100%' height='7rem' />
            </div>
        );
    else if (
        query.error instanceof LibraryApiError &&
        [401, 403, 404].includes(query.error.status)
    )
        content = (
            <div className='p-4'>
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
    else if (query.isError)
        content = (
            <div className='p-4'>
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
    else if (sentence) {
        content = (
            <div className='space-y-6 p-4'>
                <section aria-label={L('sentenceLabel')} className='space-y-2'>
                    <p
                        lang={sentence.sentenceLanguage}
                        dir='auto'
                        className='break-words text-xl font-medium leading-relaxed text-text-primary [overflow-wrap:anywhere]'
                    >
                        {sentence.sentence}
                    </p>
                    <p className='text-sm text-text-secondary'>
                        {L('langLine', {
                            from: lang(sentence.sentenceLanguage),
                            to: lang(sentence.answerLanguage),
                        })}
                    </p>
                    <div className='flex flex-wrap items-center gap-2'>
                        <DirectionBadge
                            from={sentence.sentenceLanguage}
                            to={sentence.answerLanguage}
                        />
                        <StatusBadges sentence={sentence} />
                    </div>
                    <OwnershipMeta sentence={sentence} />
                </section>
                <section className='rounded-xl border border-border-default'>
                    <button
                        type='button'
                        aria-expanded={expanded}
                        aria-controls={`${id}-reference`}
                        onClick={toggle}
                        className='flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-start text-sm font-semibold text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus'
                    >
                        {L('referenceToggle')}
                        {expanded ? (
                            <ChevronUpIcon aria-hidden className='h-4 w-4' />
                        ) : (
                            <ChevronDownIcon aria-hidden className='h-4 w-4' />
                        )}
                    </button>
                    {expanded ? (
                        <div
                            id={`${id}-reference`}
                            className='space-y-1 border-t border-border-default px-3 py-3'
                        >
                            <p
                                lang={sentence.answerLanguage}
                                dir='auto'
                                className='break-words text-base text-text-primary [overflow-wrap:anywhere]'
                            >
                                {sentence.reference}
                            </p>
                            <p className='text-xs text-text-secondary'>
                                {L('referenceNote')}
                            </p>
                        </div>
                    ) : null}
                </section>
                <HintGroups sentence={sentence} />
                <SentenceStatus
                    sentence={sentence}
                    locked={locked}
                    onArchive={archive}
                />
            </div>
        );
    }
    const closeIcon = compact ? (
        <ArrowLeftIcon aria-hidden className='h-4 w-4' />
    ) : (
        <XIcon aria-hidden className='h-4 w-4' />
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
            <div className='sticky top-0 z-10 flex items-center gap-2 border-b border-border-default bg-background-surface px-4 py-3'>
                {compact ? (
                    <IconButton
                        size='sm'
                        variant='ghost'
                        label={L('back')}
                        icon={closeIcon}
                        onClick={onClose}
                    />
                ) : null}
                <h2 className='min-w-0 flex-1 text-base font-semibold text-text-primary'>
                    {L('detailTitle')}
                </h2>
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
