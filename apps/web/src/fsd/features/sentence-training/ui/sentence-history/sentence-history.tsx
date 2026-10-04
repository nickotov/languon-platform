'use client';
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
}: {
    controller: SentenceHistoryController;
    open: boolean;
    onClose(): void;
}) {
    const { t, languageName } = useSentenceCopy();
    const compact = useCompactPresentation();
    const [tab, setTab] = useState<'ai' | 'manual'>('ai');
    const { formatDate } = useI18n();
    const rows = tab === 'ai' ? c.attempts : c.reviews;
    return (
        <Dialog
            variant={compact ? 'sheet' : 'dialog'}
            className={
                compact ? '!mb-0 !w-full !max-w-none !rounded-b-none' : ''
            }
            open={open}
            onClose={onClose}
            size='lg'
            title={t('My practice history')}
        >
            <div className='space-y-4'>
                <div
                    className='flex gap-2'
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
                <p className='text-xs text-text-tertiary'>
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
                    <div className='rounded-xl border border-border-default p-6 text-center'>
                        <p className='font-medium'>
                            {tab === 'ai'
                                ? t('No AI checks yet')
                                : t('No manual reviews yet')}
                        </p>
                        <p className='mt-1 text-sm text-text-secondary'>
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
                <ul className='space-y-3'>
                    {rows.map((row) => (
                        <li
                            key={row.id}
                            className='rounded-xl border border-border-default p-3'
                        >
                            <div className='flex flex-wrap items-center gap-2 text-xs text-text-tertiary'>
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
                                className='mt-2 break-words font-medium'
                                lang={row.exercise.sourceLanguage}
                                dir={languageDirection(
                                    row.exercise.sourceLanguage,
                                )}
                            >
                                {row.exercise.sourceText}
                            </p>
                            <details className='mt-2'>
                                <summary className='cursor-pointer text-sm text-primary-default'>
                                    {t('View details')}
                                </summary>
                                <div className='mt-3'>
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
        </Dialog>
    );
}
