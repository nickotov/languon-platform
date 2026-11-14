import { useRef, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import {
    getExerciseActivity,
    type ExerciseLearningBlock,
} from '@languon/contracts';
import { isLocale } from '@/fsd/shared/i18n';
import type { LearningAnswer, LearningBlockViewProps } from '../../types';
import { useBlockExpansion } from '../../hooks/use-block-expansion';
import { useExercisePractice } from '../../hooks/use-exercise-practice';
import { checkPreparedAnswer } from '../../lib/check-prepared-answer';
import { learningAnswerEquals } from '../../lib/learning-answer-equals';
import { ExerciseAnswerFields } from './ui/exercise-answer-fields/exercise-answer-fields';
import { ExerciseResults } from './ui/exercise-results/exercise-results';
import { ExercisePreview } from './ui/exercise-preview/exercise-preview';
import { ExerciseActions } from './ui/exercise-actions/exercise-actions';
import { exerciseCheckingLabel } from '../../lib/named-exercise-labels';
import { exerciseStatusLabel } from '../../lib/exercise-status-label';
import styles from '../styles/exercise-block-common.module.css';

export function ExerciseBlock(
    props: LearningBlockViewProps & { block: ExerciseLearningBlock },
) {
    const { block, labels } = props;
    const labelLocale = labels.locale ?? 'en';
    const locale = isLocale(labelLocale) ? labelLocale : 'en';
    const activity = block.semantics
        ? getExerciseActivity(block.semantics.activity.id)
        : undefined;
    const checkingLabel = block.semantics
        ? exerciseCheckingLabel(block.semantics.checking.policy, locale)
        : undefined;
    const form = useRef<HTMLFormElement>(null);
    const expansion = useBlockExpansion(
        props.expandAll,
        props.variant === undefined,
    );
    const practice = useExercisePractice(props.learnerState);
    const { answer, gaps, revealed, hintVisible, preparedResult } = practice;
    const response: LearningAnswer =
        block.format === 'fill-in-the-blank' ? gaps : answer;
    const preview = props.variant === 'compact' || props.variant === 'review';
    function handleExpansion() {
        expansion.toggle();
        props.onExpansionChange?.(!expansion.open);
    }

    function handleReveal() {
        if (props.interactionsDisabled) {
            return;
        }

        props.onInteraction?.(block.id, { kind: 'answer-revealed' });
        practice.reveal();
    }

    function handleHint() {
        if (props.interactionsDisabled) {
            return;
        }

        if (!hintVisible) {
            props.onInteraction?.(block.id, { kind: 'hint-used' });
        }

        practice.toggleHint();
    }

    function handleRetry() {
        if (props.interactionsDisabled) {
            return;
        }

        practice.retry();
        props.onInteraction?.(block.id, { kind: 'retry' });
        props.onAttemptedChange?.(
            block.id,
            props.learnerState !== undefined &&
                (practice.attempted || props.learnerState.attempted),
        );
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (
            props.interactionsDisabled ||
            props.attemptPending ||
            !form.current?.reportValidity()
        ) {
            return;
        }

        if (
            !props.onSubmitAttempt &&
            block.format === 'free-text' &&
            !block.semantics
        ) {
            return;
        }

        practice.markAttempted();
        props.onAttemptedChange?.(block.id, true);
        if (props.onSubmitAttempt) {
            props.onSubmitAttempt(block.id, response);
        } else {
            practice.completePreparedCheck(
                checkPreparedAnswer(block, response),
            );
        }
    }

    function handleEvaluate() {
        if (
            props.interactionsDisabled ||
            props.evaluationPending ||
            props.evaluationUnavailableReason !== undefined ||
            !props.onEvaluate ||
            !form.current?.reportValidity()
        ) {
            return;
        }

        practice.markAttempted();
        props.onAttemptedChange?.(block.id, true);
        props.onEvaluate(block.id, response);
    }

    const canSubmit =
        block.format !== 'free-text' ||
        block.semantics?.checking.policy === 'hybrid' ||
        (props.variant === undefined && props.onSubmitAttempt !== undefined);
    const submitLabel =
        props.submitAttemptLabel ?? labels.check ?? labels.answer;
    const hasHint = Boolean(props.hintTranscript || block.hint);
    const hasResponse =
        block.format === 'fill-in-the-blank'
            ? block.parts.every(
                  (part) =>
                      part.kind === 'text' || Boolean(gaps[part.id]?.trim()),
              )
            : Boolean(answer.trim());
    const panelId = `${props.scope ?? block.id}-exercise`;
    const chevronClass = expansion.open ? styles.chevronOpen : styles.chevron;
    const summaryLabel = expansion.open
        ? (activity?.locales[locale].name ??
          labels.exerciseKinds?.[block.format] ??
          labels.kinds.exercise)
        : block.question;
    const questionClass = expansion.open
        ? styles.summaryQuestion
        : styles.summaryFolded;
    const matchesSaved =
        !props.learnerState?.answer ||
        learningAnswerEquals(props.learnerState.answer, response);
    const visibleFeedback = matchesSaved ? props.feedback : undefined;
    const feedbackTitle =
        props.feedbackKind === 'ai'
            ? labels.checkWithAi
            : (labels.check ?? labels.answer);
    const preparedUnchecked =
        practice.preparedChecked &&
        preparedResult === undefined &&
        block.semantics?.checking.policy === 'hybrid';
    const status = exerciseStatusLabel({
        labels,
        attempted: practice.attempted,
        hintVisible,
        revealed,
        preparedResult,
        preparedUnchecked,
        saved: matchesSaved ? props.learnerState : undefined,
        feedback: visibleFeedback,
    });

    if (preview) {
        return <ExercisePreview {...props} />;
    }

    return (
        <div className={styles.root}>
            <button
                type='button'
                className={styles.summary}
                aria-expanded={expansion.open}
                aria-controls={panelId}
                onClick={handleExpansion}
            >
                {props.exerciseIndex !== undefined ? (
                    <span className={styles.index}>{props.exerciseIndex}.</span>
                ) : null}
                <span className={questionClass}>{summaryLabel}</span>
                <span className={styles.status}>{status}</span>
                <ChevronDown
                    size={16}
                    className={chevronClass}
                    aria-hidden='true'
                />
            </button>
            <div id={panelId} hidden={!expansion.open}>
                <form
                    ref={form}
                    className={styles.form}
                    onSubmit={handleSubmit}
                >
                    {checkingLabel && (
                        <p className={styles.secondary}>{checkingLabel}</p>
                    )}
                    <p className={styles.question} dir='auto'>
                        {block.question}
                    </p>
                    <ExerciseAnswerFields
                        block={block}
                        labels={labels}
                        answer={answer}
                        gaps={gaps}
                        onAnswer={practice.handleAnswer}
                        onGap={practice.handleGap}
                    />
                    <ExerciseActions
                        options={props}
                        canSubmit={canSubmit}
                        submitLabel={submitLabel}
                        hasResponse={hasResponse}
                        hasHint={hasHint}
                        revealed={revealed}
                        hintVisible={hintVisible}
                        onEvaluate={handleEvaluate}
                        onHint={handleHint}
                        onReveal={handleReveal}
                        onRetry={handleRetry}
                    />
                    <ExerciseResults
                        block={block}
                        labels={labels}
                        preparedResult={preparedResult}
                        visibleFeedback={visibleFeedback}
                        feedbackTitle={feedbackTitle}
                        hintVisible={hintVisible}
                        revealed={revealed}
                        hintOptions={props}
                        error={props.error}
                        evaluation={matchesSaved ? props.evaluation : undefined}
                        preparedUnchecked={preparedUnchecked}
                    />
                </form>
            </div>
        </div>
    );
}
