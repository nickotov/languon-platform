import {
    ArrowLeft,
    ArrowRight,
    CornerDownRight,
    RefreshCw,
} from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button } from '@/fsd/shared/ui';
import { useCardInteraction } from '../../hooks/use-card-interaction';
import type { Face, FlashcardItem, Presentation, Rating } from '../../types';
import styles from './flashcard.module.css';

export function Flashcard({
    item,
    face,
    position,
    onFlip,
    onRate,
    ratingDisabled,
    flipDisabled,
    recoverSwipe = false,
}: {
    item: FlashcardItem;
    face: Face;
    position: string;
    onFlip(): void;
    onRate(rating: Rating, beforeAdvance?: Promise<void>): void;
    ratingDisabled: boolean;
    flipDisabled: boolean;
    recoverSwipe?: boolean;
}) {
    const { t } = useI18n();

    const itemKey = `${item.entryId}-${item.learningVersion}`;

    const drag = useCardInteraction({
        onFlip,
        onRate,
        disabled: ratingDisabled,
        itemKey,
        recover: recoverSwipe,
    });

    const presentations = face === 'front' ? item.front : item.back;

    const faceLabel = t(`training.${face}`);

    const label = t('training.cardLabel', { face: faceLabel, position });

    const flipLabel = t(
        face === 'front' ? 'training.showBack' : 'training.showFront',
    );

    const dragging = drag.dx !== 0 && !drag.departing;

    const committed = drag.progress >= 1;

    const cardClass = `${styles.card} ${committed ? styles.committed : ''} ${dragging ? '' : styles.transition}`;

    const cardStyle = {
        transform: drag.transform,
        opacity: drag.departing ? 0 : 1,
    };

    const hintStyle = { width: `${drag.progress * 100}%` };

    const instruction = t(committed ? 'training.release' : 'training.drag');

    const containerClass = `${styles.container} ${styles.enter}`;

    return (
        <div className={containerClass}>
            <div
                ref={drag.ref}
                onPointerDown={drag.onPointerDown}
                onPointerMove={drag.onPointerMove}
                onPointerUp={drag.onPointerUp}
                onPointerCancel={drag.onPointerCancel}
                onClick={drag.onClick}
                className={cardClass}
                style={cardStyle}
                data-testid='training-card'
            >
                <div className={styles.header}>
                    <Badge tone={face === 'front' ? 'info' : 'neutral'} withDot>
                        {faceLabel}
                    </Badge>
                    <span className={styles.position}>{position}</span>
                </div>
                <div tabIndex={0} aria-label={label} className={styles.face}>
                    <dl key={`${itemKey}-${face}`} className={styles.fields}>
                        {presentations.map((presentation) => (
                            <CardField
                                key={presentation.field}
                                presentation={presentation}
                            />
                        ))}
                    </dl>
                </div>
                <div className={styles.footer}>
                    <Button
                        variant='ghost'
                        fullWidth
                        onClick={onFlip}
                        disabled={flipDisabled}
                        leadingIcon={<RefreshCw className={styles.icon} />}
                        aria-keyshortcuts='Enter Space'
                    >
                        {flipLabel}
                    </Button>
                </div>
                {dragging && (
                    <div aria-hidden className={styles.hints}>
                        <div dir='ltr' className={styles.hintLabels}>
                            <SwipeHint
                                visible={drag.dx < 0}
                                committed={committed && drag.dx < 0}
                                side='left'
                            />
                            <SwipeHint
                                visible={drag.dx > 0}
                                committed={committed && drag.dx > 0}
                                side='right'
                            />
                        </div>
                        <div className={styles.hintTrack}>
                            <div
                                className={styles.hintFill}
                                style={hintStyle}
                            />
                        </div>
                        <p className={styles.instruction}>{instruction}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function CardField({ presentation }: { presentation: Presentation }) {
    const { t, locale } = useI18n();

    const isWord =
        presentation.field === 'source' || presentation.field === 'translation';

    let textClass = styles.example;

    if (isWord) textClass = styles.word;
    else if (presentation.field === 'transcription')
        textClass = styles.transcription;
    else if (presentation.text.length > 160) textClass = styles.longExample;

    const textClasses = `${styles.text} ${textClass}`;

    const language =
        new Intl.DisplayNames([locale], { type: 'language' }).of(
            presentation.language,
        ) ?? presentation.language;

    const label = `${t(`training.field.${presentation.field}`)} · ${language}`;

    return (
        <div className={styles.field}>
            <dt className={styles.fieldLabel}>{label}</dt>
            <dd
                lang={presentation.language}
                dir={presentation.direction}
                data-card-text
                className={textClasses}
            >
                {presentation.text}
            </dd>
            {presentation.fallback && (
                <dd className={styles.fallback}>
                    <CornerDownRight
                        aria-hidden
                        className={styles.fallbackIcon}
                    />
                    <span>{t('training.fallback')}</span>
                </dd>
            )}
        </div>
    );
}

function SwipeHint({
    visible,
    committed,
    side,
}: {
    visible: boolean;
    committed: boolean;
    side: 'left' | 'right';
}) {
    const { t } = useI18n();

    const label = t(side === 'left' ? 'training.again' : 'training.known');

    const classes = `${styles.swipeHint} ${visible ? styles.visible : styles.hidden} ${committed ? styles.hintCommitted : ''}`;

    return (
        <span className={classes}>
            {side === 'left' && <ArrowLeft className={styles.icon} />}
            {label}
            {side === 'right' && <ArrowRight className={styles.icon} />}
        </span>
    );
}
