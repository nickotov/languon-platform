import styles from './sentence-practice-footer.module.css';
import { ArrowRight, Scale, SkipForward, Sparkles } from 'lucide-react';
import { Button } from '@/fsd/shared/ui';
import { useSentenceCopy } from '../sentence-copy';

type SentencePracticeFooterProps = {
    hasExercise: boolean;
    hasDraft: boolean;
    referenceShown: boolean;
    showNext: boolean;
    completed: boolean;
    nextLabel: string;
    nextDisabled: boolean;
    comparisonDisabled: boolean;
    referenceDisabled: boolean;
    checkDisabled: boolean;
    referenceLoading: boolean;
    checkLoading: boolean;
    onNext(): void;
    onCompare(): void;
    onRevealReference(): void;
    onCheck(): void;
};

export function SentencePracticeFooter({
    hasExercise,
    hasDraft,
    referenceShown,
    showNext,
    completed,
    nextLabel,
    nextDisabled,
    comparisonDisabled,
    referenceDisabled,
    checkDisabled,
    referenceLoading,
    checkLoading,
    onNext,
    onCompare,
    onRevealReference,
    onCheck,
}: SentencePracticeFooterProps) {
    const { t } = useSentenceCopy();
    let checkLabel = t(completed ? 'Check new answer' : 'Check with AI');
    if (checkLoading) checkLabel = t('Checking…');

    let comparisonLabel = t(
        hasDraft ? 'Compare with reference — free' : 'Show reference — free',
    );
    if (referenceLoading) comparisonLabel = t('Revealing…');
    const compareDisabled = hasDraft ? comparisonDisabled : referenceDisabled;
    const compareAction = hasDraft ? onCompare : onRevealReference;
    const showComparison = hasExercise && !referenceShown;
    const checkVariant = completed ? 'secondary' : 'primary';
    const nextVariant = completed ? 'primary' : 'secondary';
    const nextLeadingIcon = !completed ? (
        <SkipForward aria-hidden className={styles.icon} />
    ) : undefined;
    const nextTrailingIcon = completed ? (
        <ArrowRight aria-hidden className={styles.nextIcon} />
    ) : undefined;
    const nextAction = showNext ? (
        <Button
            variant={nextVariant}
            leadingIcon={nextLeadingIcon}
            trailingIcon={nextTrailingIcon}
            disabled={nextDisabled}
            onClick={onNext}
        >
            {nextLabel}
        </Button>
    ) : null;

    return (
        <div className={styles.footer}>
            <div>{!completed ? nextAction : null}</div>
            <div className={styles.actions}>
                {hasExercise ? (
                    <>
                        {showComparison ? (
                            <Button
                                variant='secondary'
                                leadingIcon={
                                    <Scale
                                        aria-hidden
                                        className={styles.icon}
                                    />
                                }
                                loading={referenceLoading}
                                disabled={compareDisabled}
                                aria-describedby='practice-compare-note'
                                onClick={compareAction}
                            >
                                {comparisonLabel}
                            </Button>
                        ) : null}
                    </>
                ) : null}
                <Button
                    leadingIcon={
                        <Sparkles aria-hidden className={styles.icon} />
                    }
                    variant={checkVariant}
                    loading={checkLoading}
                    disabled={checkDisabled}
                    onClick={onCheck}
                >
                    {checkLabel}
                </Button>
                {completed ? nextAction : null}
            </div>
        </div>
    );
}
