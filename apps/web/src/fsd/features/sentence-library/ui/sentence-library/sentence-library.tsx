'use client';
import { useRef, useEffect } from 'react';
import componentStyles from './sentence-library.module.css';
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
            <div className={componentStyles.root}>
                <Breadcrumb
                    className={componentStyles.breadcrumbs}
                    items={breadcrumb}
                />
                <Card
                    variant='outlined'
                    padding='none'
                    className={componentStyles.header}
                >
                    <div className={componentStyles.headerLayout}>
                        <div className={componentStyles.headingGroup}>
                            <h1 className={componentStyles.heading}>
                                <MessageSquareTextIcon
                                    aria-hidden
                                    className={componentStyles.headingIcon}
                                />
                                {L('title')}
                            </h1>
                            <div className={componentStyles.metadata}>
                                <span
                                    className={componentStyles.dictionaryName}
                                >
                                    {props.dictionary.name}
                                </span>
                                <span className={componentStyles.languagePair}>
                                    <span>
                                        {lang(props.dictionary.sourceLanguage)}
                                    </span>
                                    <ArrowRightIcon
                                        aria-hidden
                                        className={componentStyles.languageIcon}
                                    />
                                    <span>
                                        {lang(props.dictionary.targetLanguage)}
                                    </span>
                                </span>
                            </div>
                            <p className={componentStyles.description}>
                                {L('intro')}
                            </p>
                            {props.preparationChip ? (
                                <div className={componentStyles.ownership}>
                                    {props.preparationChip}
                                </div>
                            ) : null}
                        </div>
                        <div className={componentStyles.actions}>
                            <Button
                                trailingIcon={
                                    <ArrowRightIcon
                                        aria-hidden
                                        className={componentStyles.backIcon}
                                    />
                                }
                                onClick={practice}
                            >
                                {L('startPractice')}
                            </Button>
                            <div className={componentStyles.generationControl}>
                                <Button
                                    variant='secondary'
                                    leadingIcon={
                                        <SparklesIcon
                                            aria-hidden
                                            className={componentStyles.icon}
                                        />
                                    }
                                    onClick={prepare}
                                >
                                    {L('prepareAhead')}
                                </Button>
                                <span
                                    className={componentStyles.generationHelp}
                                >
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
                <p
                    aria-live='polite'
                    className={componentStyles.liveAnnouncement}
                >
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
                    renderAudio={props.renderAudio}
                />
            ) : null}
        </>
    );
}
