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
    const cardClass = `relative flex min-h-0 touch-pan-y select-text flex-col overflow-hidden rounded-3xl border bg-background-surface shadow-elevation-md ${committed ? 'border-border-focus' : 'border-border-default'} ${dragging ? '' : 'transition-[transform,opacity] duration-200 motion-reduce:transition-none'}`;
    const cardStyle = {
        transform: drag.transform,
        opacity: drag.departing ? 0 : 1,
    };
    const hintStyle = { width: `${drag.progress * 100}%` };
    const instruction = t(committed ? 'training.release' : 'training.drag');
    const containerClass = `relative flex max-h-full min-h-0 w-full flex-col ${styles.enter}`;

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
                <div className='flex shrink-0 items-center justify-between gap-2 border-b border-border-default px-4 py-3 md:px-6'>
                    <Badge tone={face === 'front' ? 'info' : 'neutral'} withDot>
                        {faceLabel}
                    </Badge>
                    <span className='text-sm text-text-tertiary'>
                        {position}
                    </span>
                </div>
                <div
                    tabIndex={0}
                    aria-label={label}
                    className='min-h-40 flex-1 touch-pan-y cursor-pointer overflow-y-auto overscroll-contain px-5 py-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus md:px-10 md:py-12'
                >
                    <dl
                        key={`${itemKey}-${face}`}
                        className={`flex flex-col gap-6 ${styles.fields}`}
                    >
                        {presentations.map((presentation) => (
                            <CardField
                                key={presentation.field}
                                presentation={presentation}
                            />
                        ))}
                    </dl>
                </div>
                <div className='shrink-0 border-t border-border-default p-2'>
                    <Button
                        variant='ghost'
                        fullWidth
                        onClick={onFlip}
                        disabled={flipDisabled}
                        leadingIcon={<RefreshCw className='h-4 w-4' />}
                        aria-keyshortcuts='Enter Space'
                    >
                        {flipLabel}
                    </Button>
                </div>
                {dragging && (
                    <div
                        aria-hidden
                        className='pointer-events-none absolute inset-x-0 top-14 flex flex-col items-center gap-2 px-4'
                    >
                        <div dir='ltr' className='flex w-full justify-between'>
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
                        <div className='h-1 w-32 overflow-hidden rounded-full bg-background-subtle'>
                            <div
                                className='h-full rounded-full bg-primary-default'
                                style={hintStyle}
                            />
                        </div>
                        <p className='rounded-full bg-background-elevated px-2 text-xs text-text-secondary'>
                            {instruction}
                        </p>
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
    let textClass = 'text-xl md:text-2xl';
    if (isWord) textClass = 'text-3xl font-semibold md:text-4xl';
    else if (presentation.field === 'transcription')
        textClass = 'text-lg text-text-secondary';
    else if (presentation.text.length > 160)
        textClass = 'text-base leading-relaxed md:text-lg';
    const textClasses = `mt-1 whitespace-pre-line break-words text-start text-text-primary ${textClass}`;
    const language =
        new Intl.DisplayNames([locale], { type: 'language' }).of(
            presentation.language,
        ) ?? presentation.language;
    const label = `${t(`training.field.${presentation.field}`)} · ${language}`;
    return (
        <div className='min-w-0'>
            <dt className='text-xs font-medium uppercase tracking-wide text-text-tertiary'>
                {label}
            </dt>
            <dd
                lang={presentation.language}
                dir={presentation.direction}
                data-card-text
                className={textClasses}
            >
                {presentation.text}
            </dd>
            {presentation.fallback && (
                <dd className='mt-2 flex items-start gap-2 text-sm text-text-secondary'>
                    <CornerDownRight
                        aria-hidden
                        className='mt-0.5 h-4 w-4 shrink-0'
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
    const classes = `inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${visible ? 'opacity-100' : 'opacity-0'} ${committed ? 'border-primary-default bg-primary-default text-text-on-primary' : 'border-border-strong bg-background-elevated text-text-primary'}`;
    return (
        <span className={classes}>
            {side === 'left' && <ArrowLeft className='h-4 w-4' />}
            {label}
            {side === 'right' && <ArrowRight className='h-4 w-4' />}
        </span>
    );
}
