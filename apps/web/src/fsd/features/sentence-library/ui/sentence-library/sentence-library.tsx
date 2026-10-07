'use client';
import { useRef, useEffect } from 'react';
import {
    rememberPreviewTrigger,
    restorePreviewTrigger,
} from '../../lib/preview-focus';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowRightIcon,
    MessageSquareTextIcon,
    SparklesIcon,
} from 'lucide-react';
import { Breadcrumb, Button, Card, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { useSentenceLibrary } from '../../hooks/use-sentence-library';
import { useInterfaceText } from '../../hooks/use-interface-text';
import { LibraryFilters } from '../library-filters/library-filters';
import { LibraryList } from '../library-list/library-list';
import { ArchiveConfirmation } from '../archive-confirmation/archive-confirmation';
import { SentenceDetail } from '../sentence-detail/sentence-detail';
import type { LibraryProps, SavedSentence } from '../../types';
export function SentenceLibrary(props: LibraryProps) {
    const c = useSentenceLibrary(props);
    const { L, lang } = useInterfaceText();
    const { href, t } = useI18n();
    const router = useRouter();
    const search = useSearchParams();
    const lastTrigger = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!props.exampleId && !c.query.isPending) restorePreviewTrigger();
    }, [props.exampleId, c.query.isPending, c.items.length]);
    const baseHref = `${props.dictionaryHref}/sentences`;
    const activeCount =
        Number(c.filters.personalArchive !== 'active') +
        Number(c.filters.contentState !== 'all') +
        Number(c.filters.globalArchive !== 'active') +
        Number(c.filters.direction !== 'target-to-source');
    const fragment =
        props.target.kind === 'shared' ? `#${props.target.shareKey}` : '';
    function practice() {
        router.push(href(`${props.dictionaryHref}?practice=setup${fragment}`));
    }
    function prepare() {
        if (props.onOpenPreparation) {
            props.onOpenPreparation();
            return;
        }
        router.push(
            href(`${props.dictionaryHref}?practice=setup&prep=1${fragment}`),
        );
    }
    function openDetail(id: string, trigger: HTMLElement) {
        lastTrigger.current = trigger;
        rememberPreviewTrigger(id);
        const params = search.toString();
        router.push(
            href(`${baseHref}/${id}${params ? `?${params}` : ''}${fragment}`),
        );
    }
    function closeDetail() {
        const params = search.toString();
        router.push(
            href(`${baseHref}${params ? `?${params}` : ''}${fragment}`),
        );
        window.setTimeout(() => lastTrigger.current?.focus(), 0);
    }
    function singleToggle(sentence: SavedSentence) {
        void c.openConfirmation(
            sentence.archivedByMe ? 'restore' : 'archive',
            false,
            sentence,
        );
    }
    function setFilter<K extends keyof typeof c.filters>(
        key: K,
        value: (typeof c.filters)[K],
    ) {
        c.updateFilters({ ...c.filters, [key]: value });
    }
    const breadcrumb = [
        { label: t('dictionary.backToLibrary'), href: href('/dictionaries') },
        {
            label: props.dictionary.name,
            href: href(`${props.dictionaryHref}${fragment}`),
        },
        { label: L('title') },
    ];
    const success = c.announcement.includes(':')
        ? c.announcement.split(':')
        : null;
    function viewRemoved() {
        c.updateFilters({ ...c.filters, personalArchive: 'archived' });
    }
    const announcement =
        c.announcement === 'selectionCleared'
            ? L('selectionCleared')
            : c.announcement;
    if (c.accessDenied)
        return (
            <InlineAlert tone='error' title={L('detailRemovedTitle')}>
                {L('detailRemovedBody')}
            </InlineAlert>
        );
    return (
        <>
            <div className='space-y-5 pb-28 lg:pb-16'>
                <Breadcrumb
                    className='[&_a:hover]:text-text-primary [&_a]:text-text-secondary'
                    items={breadcrumb}
                />
                <Card
                    variant='outlined'
                    padding='none'
                    className='border-border-default bg-background-surface p-4 text-text-primary'
                >
                    <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                        <div className='min-w-0 space-y-1'>
                            <h1 className='flex items-center gap-2 text-2xl font-semibold text-text-primary'>
                                <MessageSquareTextIcon
                                    aria-hidden
                                    className='h-6 w-6 shrink-0 text-text-secondary'
                                />
                                {L('title')}
                            </h1>
                            <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary'>
                                <span className='font-medium text-text-primary'>
                                    {props.dictionary.name}
                                </span>
                                <span className='inline-flex items-center gap-1.5 text-sm text-text-secondary'>
                                    <span>
                                        {lang(props.dictionary.sourceLanguage)}
                                    </span>
                                    <ArrowRightIcon
                                        aria-hidden
                                        className='h-3.5 w-3.5 shrink-0'
                                    />
                                    <span>
                                        {lang(props.dictionary.targetLanguage)}
                                    </span>
                                </span>
                            </div>
                            <p className='max-w-2xl text-sm text-text-secondary'>
                                {L('intro')}
                            </p>
                            {props.preparationChip ? (
                                <div className='pt-1'>
                                    {props.preparationChip}
                                </div>
                            ) : null}
                        </div>
                        <div className='flex shrink-0 flex-col gap-2 sm:flex-row sm:items-start lg:flex-col lg:items-end'>
                            <Button
                                trailingIcon={
                                    <ArrowRightIcon
                                        aria-hidden
                                        className='h-4 w-4 rtl:rotate-180'
                                    />
                                }
                                onClick={practice}
                            >
                                {L('startPractice')}
                            </Button>
                            <div className='flex flex-col gap-1 lg:items-end'>
                                <Button
                                    variant='secondary'
                                    leadingIcon={
                                        <SparklesIcon
                                            aria-hidden
                                            className='h-4 w-4'
                                        />
                                    }
                                    onClick={prepare}
                                >
                                    {L('prepareAhead')}
                                </Button>
                                <span className='text-xs text-text-secondary'>
                                    {L('prepareAheadHint')}
                                </span>
                            </div>
                        </div>
                    </div>
                </Card>
                {success ? (
                    <InlineAlert
                        tone='success'
                        title={L(
                            success[0] === 'archive'
                                ? 'successRemoved'
                                : 'successRestored',
                            { n: Number(success[1]) },
                        )}
                        actions={
                            success[0] === 'archive' ? (
                                <Button
                                    size='compact'
                                    variant='secondary'
                                    onClick={viewRemoved}
                                >
                                    {L('mineArchived')}
                                </Button>
                            ) : undefined
                        }
                    />
                ) : null}
                <LibraryFilters
                    dictionary={props.dictionary}
                    filters={c.filters}
                    activeCount={activeCount}
                    onChange={setFilter}
                    onReset={c.resetFilters}
                />
                <p aria-live='polite' className='sr-only'>
                    {announcement}
                </p>
                <LibraryList
                    c={c}
                    practice={practice}
                    openDetail={openDetail}
                    singleToggle={singleToggle}
                />
            </div>
            <ArchiveConfirmation controller={c} dictionary={props.dictionary} />
            {props.exampleId ? (
                <SentenceDetail
                    api={c.api}
                    id={props.exampleId}
                    identity={props.identity}
                    onClose={closeDetail}
                    onArchiveToggle={singleToggle}
                    locked={c.pending}
                />
            ) : null}
        </>
    );
}
