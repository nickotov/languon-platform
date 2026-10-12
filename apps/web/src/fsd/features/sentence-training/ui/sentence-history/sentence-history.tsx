'use client';
import styles from './sentence-history.module.css';
import { useSentenceCopy } from '../sentence-copy';
import { useCompactPresentation } from '../use-compact-presentation';

import { useState } from 'react';
import { Badge, Button, Dialog, LoadingState } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import type { SentenceHistoryController } from '../../types';
import {
    AiResultPanel,
    languageDirection,
    ReferencePanel,
} from '../sentence-content/sentence-content';
import { SentenceErrorNotice } from '../sentence-errors/sentence-errors';

export function SentenceHistory({
    controller: c,
    open,
    onClose,
    inline = false,
}: {
    controller: SentenceHistoryController;
    open: boolean;
    onClose(): void;
    inline?: boolean;
}) {
    const { t, languageName } = useSentenceCopy();
    const compact = useCompactPresentation();
    const [tab, setTab] = useState<'ai' | 'manual'>('ai');
    const { formatDate } = useI18n();
    const rows = tab === 'ai' ? c.attempts : c.reviews;
    const content = (
        <>
            <div className={styles.historyContent}>
                <div
                    className={styles.tabs}
                    role='group'
                    aria-label={t('History type')}
                >
                    <Button
                        variant={tab === 'ai' ? 'primary' : 'secondary'}
                        aria-pressed={tab === 'ai'}
                        onClick={() => setTab('ai')}
                    >
                        {t('AI checks')}
                    </Button>
                    <Button
                        variant={tab === 'manual' ? 'primary' : 'secondary'}
                        aria-pressed={tab === 'manual'}
                        onClick={() => setTab('manual')}
                    >
                        {t('Manual reviews')}
                    </Button>
                </div>
                <p className={styles.historyNote}>
                    {t(
                        'Only your own results appear here. Outdated sentences remain readable and cannot be used again.',
                    )}
                </p>
                {c.loading ? (
                    <LoadingState>{t('Loading history')}</LoadingState>
                ) : null}
                {c.error ? (
                    <SentenceErrorNotice
                        error={c.error}
                        onRetry={() =>
                            void (rows.length
                                ? tab === 'ai'
                                    ? c.loadMoreAttempts()
                                    : c.loadMoreReviews()
                                : c.refresh())
                        }
                    />
                ) : null}
                {!c.loading && !c.error && rows.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p className={styles.emptyTitle}>
                            {tab === 'ai'
                                ? t('No AI checks yet')
                                : t('No manual reviews yet')}
                        </p>
                        <p className={styles.emptyDescription}>
                            {tab === 'ai'
                                ? t(
                                      'Results appear after you check a translation with AI.',
                                  )
                                : t(
                                      'Reviews appear after you choose Show reference answer.',
                                  )}
                        </p>
                    </div>
                ) : null}
                <ul className={styles.historyList}>
                    {rows.map((row) => (
                        <li key={row.id} className={styles.historyItem}>
                            <div className={styles.itemMetadata}>
                                <time dateTime={row.createdAt}>
                                    {formatDate(row.createdAt)}
                                </time>
                                <span>
                                    {languageName(row.exercise.sourceLanguage)}{' '}
                                    →{' '}
                                    {languageName(row.exercise.targetLanguage)}
                                </span>
                                {row.contentState === 'outdated' ? (
                                    <Badge size='sm' tone='warning'>
                                        {t('Outdated · read only')}
                                    </Badge>
                                ) : null}
                            </div>
                            <p
                                className={styles.sourceSentence}
                                lang={row.exercise.sourceLanguage}
                                dir={languageDirection(
                                    row.exercise.sourceLanguage,
                                )}
                            >
                                {row.exercise.sourceText}
                            </p>
                            <details className={styles.itemDetails}>
                                <summary className={styles.detailsAction}>
                                    {t('View details')}
                                </summary>
                                <div className={styles.feedback}>
                                    {'feedback' in row ? (
                                        <AiResultPanel attempt={row} />
                                    ) : (
                                        <ReferencePanel review={row} />
                                    )}
                                </div>
                            </details>
                        </li>
                    ))}
                </ul>
                {(tab === 'ai' ? c.hasMoreAttempts : c.hasMoreReviews) ? (
                    <Button
                        fullWidth
                        variant='secondary'
                        loading={c.loading}
                        onClick={() =>
                            void (tab === 'ai'
                                ? c.loadMoreAttempts()
                                : c.loadMoreReviews())
                        }
                    >
                        {t('Load more')}
                    </Button>
                ) : null}
            </div>
        </>
    );
    if (!open) return null;
    if (inline)
        return (
            <section className={styles.inlineHistory}>
                <h3 className={styles.historyTitle}>
                    {t('My practice history')}
                </h3>
                {content}
            </section>
        );
    return (
        <Dialog
            variant={compact ? 'sheet' : 'dialog'}
            className={compact ? styles.compactDialog : ''}
            open={open}
            onClose={onClose}
            size='lg'
            title={t('My practice history')}
        >
            {content}
        </Dialog>
    );
}
