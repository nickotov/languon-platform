import type { SpeechSource, FlashcardItem } from '@languon/contracts';
import { SpeechControl } from '@/fsd/features/speech-playback';
import type { TrainingLauncherProps } from '@/fsd/features/flashcard-training';

/** Allocate render callbacks with the current identity-scoped training props. */
export function createTrainingAudio(props: TrainingLauncherProps) {
    function renderFlashcardAudio(
        item: FlashcardItem,
        presentation: FlashcardItem['front'][number],
    ) {
        if (
            !props.signedIn ||
            presentation.field === 'definition' ||
            presentation.field === 'transcription'
        ) {
            return null;
        }

        const source: SpeechSource = {
            kind: 'flashcard-field',
            access: props.target,
            cardId: item.entryId,
            field: presentation.field,
            expectedLearningVersion: item.learningVersion,
        };

        return (
            <SpeechControl
                source={source}
                requestWithSession={props.requestWithSession}
            />
        );
    }

    function renderAnswerAudio(attemptId: string) {
        return renderSentenceAudio({ kind: 'checked-answer', id: attemptId });
    }

    function renderSentenceAudio(content: {
        kind: 'prompt' | 'reference' | 'checked-answer';
        id: string;
        sessionId?: string;
    }) {
        if (!props.signedIn) {
            return null;
        }

        let source: SpeechSource;
        if (content.kind === 'checked-answer') {
            source = {
                kind: 'checked-answer',
                access: props.target,
                attemptId: content.id,
            };
        } else {
            if (!content.sessionId) {
                return null;
            }

            source = {
                kind: 'sentence-practice',
                access: props.target,
                exerciseId: content.id,
                sessionId: content.sessionId,
                field: content.kind,
            };
        }

        return (
            <SpeechControl
                source={source}
                requestWithSession={props.requestWithSession}
            />
        );
    }

    return { renderFlashcardAudio, renderSentenceAudio, renderAnswerAudio };
}
