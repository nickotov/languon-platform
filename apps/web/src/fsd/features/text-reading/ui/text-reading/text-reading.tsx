'use client';
import { useEffect, useRef, useState } from 'react';
import { ActionConsentDialog } from '@/fsd/entities/ai-action';
import { Tabs } from '@/fsd/shared/ui';
import { ReadingPair } from './reading-pair';
import { CollectionLayer } from './collection-layer';
import { CounterpartSheet } from './counterpart-sheet';
import { useI18n } from '@/fsd/shared/i18n';
import { analyzeReadingSelection } from '../../lib/selection';
import { useCollect } from '../../hooks/use-collect';
import { useReadingCopy } from '../../hooks/use-reading-copy';
import type { Side, TextReadingProps } from '../../types';
import styles from './text-reading.module.css';

export function TextReading(props: TextReadingProps) {
    // A different source authority owns a fresh selection, polling loop and marks.
    const source = props.source;
    let sourceId = '';

    if (source?.kind === 'translation-proposal') sourceId = source.jobId;
    if (source?.kind === 'shared-text') sourceId = source.shareId;

    const key = `${props.collectionActorKey}:${props.document.id}:${props.document.version}:${source?.kind ?? 'none'}:${sourceId}`;
    return <ReadingSurface key={key} {...props} />;
}

function ReadingSurface(props: TextReadingProps) {
    const { document: doc, matchMode } = props;
    const t = useReadingCopy();
    const { locale } = useI18n();
    const c = useCollect(props);
    const [compact, setCompact] = useState(false);
    const [internalTab, setInternalTab] = useState<Side>('source');
    const tab = props.tab ?? internalTab;
    const [active, setActive] = useState<string | null>(null);
    const [focused, setFocused] = useState<string | null>(null);
    const [sheet, setSheet] = useState<number | null>(null);
    const [announcement, setAnnouncement] = useState('');
    const content = useRef<HTMLDivElement>(null);
    const scroll = useRef<HTMLDivElement>(null);
    const pairs = doc.alignment?.source ?? [];
    const language = (code: string) =>
        new Intl.DisplayNames(locale, { type: 'language' }).of(code) ?? code;

    useEffect(() => {
        const media = window.matchMedia('(max-width: 1023px)');
        const change = () => setCompact(media.matches);
        change();
        media.addEventListener('change', change);
        return () => media.removeEventListener('change', change);
    }, []);

    useEffect(() => {
        if (!matchMode) {
            setActive(null);
            setFocused(null);
            setSheet(null);
        }
    }, [matchMode]);

    useEffect(() => {
        if (props.collectionDisabled || !doc.alignment || !props.source) return;
        let timer = 0;
        const handle = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(
                () => c.onSelection(analyzeReadingSelection(content.current)),
                220,
            );
        };
        window.document.addEventListener('selectionchange', handle);
        return () => {
            window.clearTimeout(timer);
            window.document.removeEventListener('selectionchange', handle);
        };
    }, [c.onSelection, props.collectionDisabled, props.source, doc.alignment]);

    const changeTab = (side: Side) => {
        const visible = [
            ...(content.current?.querySelectorAll<HTMLElement>(
                `[data-side="${tab}"]`,
            ) ?? []),
        ].find(
            (el) =>
                el.getBoundingClientRect().bottom >
                (scroll.current?.getBoundingClientRect().top ?? 0) + 72,
        );
        if (props.onTabChange) props.onTabChange(side);
        else setInternalTab(side);
        if (visible)
            window.requestAnimationFrame(() => {
                const next = [
                    ...(content.current?.querySelectorAll<HTMLElement>(
                        '[data-reading-pair]',
                    ) ?? []),
                ].find(
                    (el) =>
                        el.dataset.readingPair ===
                            visible.dataset.readingPair &&
                        el.dataset.side === side,
                );
                next?.scrollIntoView({ block: 'start' });
            });
    };

    function selectTab(value: string) {
        changeTab(value as Side);
    }

    const paragraphs: number[][] = [];
    pairs.forEach((pair, index) => {
        const previous = pairs[index - 1];
        if (!previous || previous.paragraphIndex !== pair.paragraphIndex)
            paragraphs.push([]);
        paragraphs.at(-1)!.push(index);
    });

    return (
        <>
            <div className={styles.reader} ref={scroll}>
                <div className={styles.header}>
                    {compact ? (
                        <Tabs
                            value={tab}
                            onValueChange={selectTab}
                            variant='segmented'
                            size='sm'
                            fullWidth
                            aria-label={t('texts.reading.choose')}
                            items={(['source', 'translation'] as const).map(
                                (side) => ({
                                    value: side,
                                    label: `${t(side === 'source' ? 'texts.reading.source' : 'texts.reading.translation')} · ${language(side === 'source' ? doc.sourceLanguage : doc.targetLanguage)}`,
                                }),
                            )}
                        />
                    ) : (
                        <div className={styles.headings}>
                            <span>
                                {t('texts.reading.source')} ·{' '}
                                {language(doc.sourceLanguage)}
                            </span>
                            <span>
                                {t('texts.reading.translation')} ·{' '}
                                {language(doc.targetLanguage)}
                            </span>
                        </div>
                    )}
                </div>
                {props.topSlot && (
                    <div className={styles.topSlot}>{props.topSlot}</div>
                )}
                <div className={styles.content} ref={content}>
                    {doc.alignment ? (
                        paragraphs.map((indices, index) => (
                            <div className={styles.paragraph} key={index}>
                                {(['source', 'translation'] as const).map(
                                    (side) =>
                                        (!compact || tab === side) && (
                                            <p
                                                key={side}
                                                lang={
                                                    side === 'source'
                                                        ? doc.sourceLanguage
                                                        : doc.targetLanguage
                                                }
                                                dir='auto'
                                            >
                                                {indices.map((i) => (
                                                    <ReadingPair
                                                        key={pairs[i]!.pairId}
                                                        index={i}
                                                        side={side}
                                                        props={props}
                                                        c={c}
                                                        compact={compact}
                                                        active={active}
                                                        focused={focused}
                                                        setActive={setActive}
                                                        setFocused={setFocused}
                                                        setAnnouncement={
                                                            setAnnouncement
                                                        }
                                                        setSheet={setSheet}
                                                    />
                                                ))}
                                            </p>
                                        ),
                                )}
                            </div>
                        ))
                    ) : (
                        <p
                            className={styles.draft}
                            lang={doc.sourceLanguage}
                            dir='auto'
                        >
                            {doc.sourceText}
                        </p>
                    )}
                </div>
                <p className={styles.srOnly} aria-live='polite'>
                    {announcement}
                </p>
            </div>
            <CounterpartSheet
                sheet={sheet}
                setSheet={setSheet}
                doc={doc}
                language={language}
            />
            <ActionConsentDialog
                quote={c.actionConsent.quote}
                onSend={c.actionConsent.confirm}
                onClose={c.actionConsent.cancel}
            />
            <CollectionLayer
                requestWithSession={props.requestWithSession}
                c={c}
                compact={compact}
                onRequireSignIn={props.onRequireSignIn}
            />
        </>
    );
}
