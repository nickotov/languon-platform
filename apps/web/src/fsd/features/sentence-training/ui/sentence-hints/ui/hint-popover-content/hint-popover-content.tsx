import type { KeyboardEvent, RefObject } from 'react';
import type { SentenceExercise } from '@languon/contracts';
import { Bookmark, Lightbulb, X } from 'lucide-react';
import { Button, PopoverContent } from '@/fsd/shared/ui';
import { useSentenceCopy } from '../../../sentence-copy';
import styles from '../../../styles/sentence-hints-common.module.css';

export function HintPopoverContent({
    exercise,
    hint,
    segment,
    popoverId,
    panelRef,
    onClose,
    onKeyDown,
}: {
    exercise: SentenceExercise;
    hint: SentenceExercise['hints'][number];
    segment: SentenceExercise['segments'][number];
    popoverId: string;
    panelRef: RefObject<HTMLDivElement | null>;
    onClose(): void;
    onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
}) {
    const { t } = useSentenceCopy();

    return (
        <PopoverContent
            autoFocus={false}
            closeOnFocusOut={false}
            side='bottom'
            align='start'
            id={popoverId}
            ref={panelRef}
            role='dialog'
            aria-label={`${t('Hint')}: ${segment.text}`}
            onKeyDown={onKeyDown}
            className={styles.hintPopover}
        >
            <div className={styles.popoverHeader}>
                <span
                    className={`${styles.hintKind} ${hint.kind === 'contextual' ? styles.contextualKind : styles.dictionaryKind}`}
                >
                    {hint.kind === 'contextual' ? (
                        <Lightbulb aria-hidden className={styles.icon} />
                    ) : (
                        <Bookmark aria-hidden className={styles.icon} />
                    )}
                    {t(
                        hint.kind === 'contextual'
                            ? 'Extra help'
                            : 'Required word',
                    )}
                </span>
                <Button
                    variant='ghost'
                    size='compact'
                    aria-label={t('Close hint')}
                    onClick={onClose}
                >
                    <X aria-hidden className={styles.icon2} />
                </Button>
            </div>
            <p className={styles.hintTranslation}>
                <span lang={exercise.sourceLanguage}>{segment.text}</span>
                <span aria-hidden> → </span>
                <strong
                    lang={exercise.targetLanguage}
                    dir={
                        /^(ar|he|fa|ur)(-|$)/i.test(exercise.targetLanguage)
                            ? 'rtl'
                            : 'ltr'
                    }
                >
                    {hint.text}
                </strong>
            </p>
            <p className={styles.hintNote}>
                {t(
                    hint.kind === 'contextual'
                        ? 'Support only — not required and not added to your dictionary.'
                        : 'Use this dictionary word. Inflected forms are fine.',
                )}
            </p>
            <p className={styles.hintDisclaimer}>
                {t('Hints are free and never lower your score.')}
            </p>
        </PopoverContent>
    );
}
