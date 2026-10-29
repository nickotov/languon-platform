import { Lightbulb, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/fsd/shared/ui/button/button';
import type { LearningBlockViewProps } from '../../types';
import styles from './exercise-block.module.css';

type ActionOptions = Pick<
    LearningBlockViewProps,
    | 'labels'
    | 'interactionsDisabled'
    | 'attemptPending'
    | 'evaluationPending'
    | 'evaluationUnavailableReason'
    | 'onEvaluate'
>;
export function ExerciseActions({
    options: props,
    canSubmit,
    submitLabel,
    hasResponse,
    hasHint,
    revealed,
    hintVisible,
    onEvaluate: handleEvaluate,
    onHint: handleHint,
    onReveal: handleReveal,
    onRetry: handleRetry,
}: {
    options: ActionOptions;
    canSubmit: boolean;
    submitLabel: string;
    hasResponse: boolean;
    hasHint: boolean;
    revealed: boolean;
    hintVisible: boolean;
    onEvaluate: () => void;
    onHint: () => void;
    onReveal: () => void;
    onRetry: () => void;
}) {
    const labels = props.labels;
    const canEvaluate =
        props.onEvaluate !== undefined ||
        props.evaluationUnavailableReason !== undefined;
    const evaluationUnavailable =
        props.evaluationUnavailableReason !== undefined ||
        props.onEvaluate === undefined;
    return (
        <div className={styles.actions}>
            {canSubmit ? (
                <Button
                    type='submit'
                    size='compact'
                    loading={props.attemptPending ?? false}
                    disabled={!hasResponse || props.interactionsDisabled}
                >
                    {submitLabel}
                </Button>
            ) : null}
            {canEvaluate ? (
                <Button
                    type='button'
                    size='compact'
                    variant={canSubmit ? 'ghost' : 'primary'}
                    leadingIcon={<Sparkles size={14} />}
                    onClick={handleEvaluate}
                    loading={props.evaluationPending ?? false}
                    disabled={
                        !hasResponse ||
                        props.interactionsDisabled ||
                        evaluationUnavailable
                    }
                    title={props.evaluationUnavailableReason}
                >
                    {labels.checkWithAi}
                </Button>
            ) : null}
            {hasHint ? (
                <Button
                    type='button'
                    size='compact'
                    variant='ghost'
                    leadingIcon={<Lightbulb size={14} />}
                    onClick={handleHint}
                    aria-expanded={hintVisible}
                    disabled={props.interactionsDisabled}
                >
                    {labels.hint}
                </Button>
            ) : null}
            <Button
                type='button'
                size='compact'
                variant='ghost'
                onClick={handleReveal}
                disabled={revealed || props.interactionsDisabled}
            >
                {labels.showAnswer}
            </Button>
            <Button
                type='button'
                size='compact'
                variant='ghost'
                leadingIcon={<RotateCcw size={14} />}
                onClick={handleRetry}
                disabled={props.interactionsDisabled}
            >
                {labels.retry}
            </Button>
        </div>
    );
}
