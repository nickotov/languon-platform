import type { ReactNode } from 'react';
import type { FlashcardItem, Presentation, Rating } from '../../../../types';
import type {
    usePracticeSession,
    SessionState,
} from '../../../../hooks/use-practice-session';
import { Flashcard } from '../../../flashcard/flashcard';
import { RatingButton } from '../../../rating-button/rating-button';
import { CardSkeleton } from '../card-skeleton/card-skeleton';
import styles from '../../../styles/practice-content-common.module.css';

type CardSession = Pick<
    ReturnType<typeof usePracticeSession>,
    'currentItem' | 'flip' | 'rate'
> & {
    state: Pick<
        SessionState,
        'round' | 'index' | 'face' | 'conflict' | 'pending'
    >;
};

export function PracticeCardPhase({
    session,
    renderAudio,
    blocked,
    saving,
    position,
    flipDisabled,
    undo,
}: {
    session: CardSession;
    renderAudio:
        | ((item: FlashcardItem, presentation: Presentation) => ReactNode)
        | undefined;
    blocked: boolean;
    saving: Rating | undefined;
    position: string;
    flipDisabled: boolean;
    undo: ReactNode;
}) {
    const { state } = session;

    return (
        <>
            <div dir='ltr' className={styles.cardLayout}>
                <RatingButton
                    rating='again'
                    onRate={session.rate}
                    disabled={blocked}
                    loading={saving === 'again'}
                />
                <div className={styles.cardSlot}>
                    {session.currentItem ? (
                        <Flashcard
                            key={`${state.round}-${state.index}-${session.currentItem.entryId}-${session.currentItem.learningVersion}`}
                            renderAudio={renderAudio}
                            item={session.currentItem}
                            face={state.face}
                            position={position}
                            onFlip={session.flip}
                            onRate={session.rate}
                            ratingDisabled={blocked}
                            flipDisabled={flipDisabled}
                            recoverSwipe={Boolean(
                                state.conflict ||
                                state.pending?.status === 'error',
                            )}
                        />
                    ) : (
                        <div className={styles.loadingSlot}>
                            <CardSkeleton />
                        </div>
                    )}
                </div>
                <RatingButton
                    rating='known'
                    onRate={session.rate}
                    disabled={blocked}
                    loading={saving === 'known'}
                />
            </div>
            <div dir='ltr' className={styles.mobileRatings}>
                <RatingButton
                    mobile
                    rating='again'
                    onRate={session.rate}
                    disabled={blocked}
                    loading={saving === 'again'}
                />
                <RatingButton
                    mobile
                    rating='known'
                    onRate={session.rate}
                    disabled={blocked}
                    loading={saving === 'known'}
                />
            </div>
            <div className={styles.undo}>{undo}</div>
        </>
    );
}
