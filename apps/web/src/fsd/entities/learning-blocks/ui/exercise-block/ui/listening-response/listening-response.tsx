import { matchesPreparedAnswer } from '../../../../lib/check-prepared-answer';
import {
    compareDictation,
    type ExerciseLearningBlock,
} from '@languon/contracts';
import type { LearningAnswer, LearningBlockLabels } from '../../../../types';
import { listeningCopy } from '../../../../lib/listening-copy';
import styles from '../../../styles/exercise-block-common.module.css';
export function ListeningResponse({
    block,
    response,
    labels,
}: {
    block: ExerciseLearningBlock;
    response: LearningAnswer;
    labels: LearningBlockLabels;
}) {
    const [, , missing, replace, extra, gap] = listeningCopy(labels.locale);
    if (
        block.format === 'free-text' &&
        block.semantics?.activity.id === 'L02' &&
        typeof response === 'string'
    ) {
        const words = compareDictation(
            block.referenceAnswer,
            response,
            block.semantics.language,
        );

        return (
            <p className={styles.wordFeedback} dir='auto' aria-live='polite'>
                {words.map((word, index) => {
                    if (word.kind === 'matched') {
                        return <span key={index}>{word.expected} </span>;
                    }

                    const label =
                        word.kind === 'missing'
                            ? missing
                            : word.kind === 'extra'
                              ? extra
                              : replace;

                    return (
                        <span className={styles.wordCorrection} key={index}>
                            <small>{label}</small>
                            {word.submitted && <del>{word.submitted}</del>}{' '}
                            {word.expected && <ins>{word.expected}</ins>}{' '}
                        </span>
                    );
                })}
            </p>
        );
    }

    if (
        block.format !== 'fill-in-the-blank' ||
        block.semantics?.activity.id !== 'L04' ||
        typeof response === 'string'
    ) {
        return null;
    }

    return (
        <ul className={styles.gapFeedback} aria-live='polite'>
            {block.parts
                .filter((part) => part.kind === 'gap')
                .map((part, index) => {
                    const answer = response[part.id] ?? '';
                    const correct = matchesPreparedAnswer(
                        part.acceptedAnswers,
                        answer,
                    );

                    return (
                        <li key={part.id}>
                            {gap} {index + 1} ·{' '}
                            {correct ? labels.correct : labels.incorrect} —{' '}
                            {correct ? (
                                answer
                            ) : (
                                <>
                                    <del>{answer}</del>{' '}
                                    <ins>{part.acceptedAnswers[0]}</ins>
                                </>
                            )}
                        </li>
                    );
                })}
        </ul>
    );
}
