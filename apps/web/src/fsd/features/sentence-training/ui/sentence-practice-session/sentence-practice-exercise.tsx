import type { ChangeEvent, ReactNode, Ref } from 'react';
import { Flag } from 'lucide-react';
import { Textarea } from '@/fsd/shared/ui';
import { SENTENCE_LIMITS, type SentenceExercise } from '@languon/contracts';
import type { SentenceSessionController } from '../../types';
import {
    AiResultPanel,
    SentenceWithHints,
    languageDirection,
} from '../sentence-content/sentence-content';
import { SentenceJobStatus } from '../sentence-job-status/sentence-job-status';
import { useSentenceCopy } from '../sentence-copy';
import styles from './sentence-practice-session.module.css';

export function SentencePracticeExercise({
    c,
    exercise,
    draftRef,
    draftLength,
    draftOverLimit,
    innerView,
    promptAudio,
    checkedAudio,
    jobPending,
    onCancel,
}: {
    c: Pick<
        SentenceSessionController,
        | 'configuration'
        | 'roundComplete'
        | 'revealedHintIds'
        | 'toggleHint'
        | 'draft'
        | 'setDraft'
        | 'busy'
        | 'uncertain'
        | 'job'
        | 'attempt'
    >;
    exercise: SentenceExercise;
    draftRef: Ref<HTMLTextAreaElement>;
    draftLength: number;
    draftOverLimit: boolean;
    innerView: boolean;
    promptAudio: ReactNode;
    checkedAudio: ReactNode;
    jobPending: boolean | null | undefined;
    onCancel(): void;
}) {
    const { t, languageName } = useSentenceCopy();
    let entryLabel = `${languageName(exercise.sourceLanguage)} → ${languageName(exercise.targetLanguage)}`;
    if (c.configuration) {
        let modeLabel: 'Review only' | 'Saved first' | 'New only' =
            'Review only';

        if (c.configuration.mode === 'saved-first') {
            modeLabel = 'Saved first';
        } else if (c.configuration.mode === 'new-only') {
            modeLabel = 'New only';
        }

        const feedbackLabel = t('Feedback in {language}').replace(
            '{language}',
            languageName(c.configuration.explanationLanguage ?? 'en'),
        );

        entryLabel += ` · ${t(modeLabel)} · ${feedbackLabel}`;
    }

    function changeDraft(event: ChangeEvent<HTMLTextAreaElement>) {
        c.setDraft(event.target.value);
    }

    return (
        <>
            <p className={styles.entryBadge}>{entryLabel}</p>
            {c.roundComplete ? (
                <div role='status' className={styles.dictionaryNotice}>
                    <Flag aria-hidden className={styles.dictionaryNoticeIcon} />
                    <p>
                        <strong>{t('Last sentence.')}</strong>{' '}
                        {t(
                            'Check, compare or skip this sentence to see your results.',
                        )}
                    </p>
                </div>
            ) : null}
            <div className={styles.answerPanel}>
                <SentenceWithHints
                    key={exercise.id}
                    exercise={exercise}
                    revealedHintIds={c.revealedHintIds}
                    onReveal={c.toggleHint}
                />
                {!innerView ? promptAudio : null}
            </div>
            <Textarea
                ref={draftRef}
                label={t('Your translation ({language})').replace(
                    '{language}',
                    languageName(exercise.targetLanguage),
                )}
                lang={exercise.targetLanguage}
                dir={languageDirection(exercise.targetLanguage)}
                value={c.draft}
                onChange={changeDraft}
                rows={3}
                className={styles.answerInput}
                {...(draftOverLimit
                    ? {
                          error: t(
                              'Your answer is over the 4,000-character limit.',
                          ),
                      }
                    : {})}
                disabled={c.busy || c.uncertain}
                description={t(
                    'Use the matching dictionary words. Hints and reference use do not reduce the AI score.',
                )}
            />
            {draftLength >=
            Math.floor(SENTENCE_LIMITS.answerCodePoints * 0.85) ? (
                <p
                    aria-live='polite'
                    className={
                        draftOverLimit ? styles.answerError : styles.answerCount
                    }
                >
                    {draftLength} / {SENTENCE_LIMITS.answerCodePoints}
                </p>
            ) : null}
            {jobPending && c.job?.kind === 'sentence-check' ? (
                <SentenceJobStatus job={c.job} onCancel={onCancel} />
            ) : null}
            {c.attempt ? (
                <AiResultPanel
                    key={c.attempt.id}
                    attempt={c.attempt}
                    audio={innerView ? null : checkedAudio}
                />
            ) : null}
        </>
    );
}
