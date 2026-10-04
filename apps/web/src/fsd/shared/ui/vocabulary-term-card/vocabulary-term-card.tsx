import { EyeOffIcon, StarIcon, Volume2Icon } from 'lucide-react';
import styles from './vocabulary-term-card.module.css';
export type PartOfSpeech =
    | 'noun'
    | 'verb'
    | 'adjective'
    | 'adverb'
    | 'pronoun'
    | 'preposition'
    | 'conjunction'
    | 'interjection'
    | 'phrase';
export interface VocabularyTermCardProps {
    term: string;
    translation: string;
    partOfSpeech?: PartOfSpeech;
    pronunciation?: string;
    example?: string;
    exampleTranslation?: string;
    hideTranslation?: boolean;
    saved?: boolean;
    onToggleSave?: () => void;
    onPlayAudio?: () => void;
    onClick?: () => void;
    className?: string;
}
const labels: Record<PartOfSpeech, string> = {
    noun: 'noun',
    verb: 'verb',
    adjective: 'adj.',
    adverb: 'adv.',
    pronoun: 'pron.',
    preposition: 'prep.',
    conjunction: 'conj.',
    interjection: 'interj.',
    phrase: 'phrase',
};
export function VocabularyTermCard({
    term,
    translation,
    partOfSpeech,
    pronunciation,
    example,
    exampleTranslation,
    hideTranslation = false,
    saved = false,
    onToggleSave,
    onPlayAudio,
    onClick,
    className,
}: VocabularyTermCardProps) {
    const content = (
        <>
            <div className={styles.top}>
                <div className={styles.copy}>
                    <div className={styles.termRow}>
                        <h3 className={styles.term}>{term}</h3>
                        {pronunciation ? (
                            <span className={styles.pronunciation}>
                                {pronunciation}
                            </span>
                        ) : null}
                        {partOfSpeech ? (
                            <span className={styles.part}>
                                {labels[partOfSpeech]}
                            </span>
                        ) : null}
                    </div>
                    {hideTranslation ? (
                        <p className={styles.hidden}>
                            <EyeOffIcon
                                className={styles.hiddenIcon}
                                aria-hidden='true'
                            />
                            Translation hidden
                        </p>
                    ) : (
                        <p className={styles.translation}>{translation}</p>
                    )}
                </div>
                {onPlayAudio || onToggleSave ? (
                    <div className={styles.actions}>
                        {onPlayAudio ? (
                            <button
                                className={styles.actionButton}
                                type='button'
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onPlayAudio();
                                }}
                                aria-label={`Play pronunciation of ${term}`}
                            >
                                <Volume2Icon
                                    className={styles.actionIcon}
                                    aria-hidden='true'
                                />
                            </button>
                        ) : null}
                        {onToggleSave ? (
                            <button
                                className={styles.actionButton}
                                type='button'
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onToggleSave();
                                }}
                                aria-pressed={saved}
                                aria-label={
                                    saved
                                        ? `Remove ${term} from saved`
                                        : `Save ${term}`
                                }
                            >
                                <StarIcon
                                    className={[
                                        styles.actionIcon,
                                        saved ? styles.saved : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    aria-hidden='true'
                                />
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
            {example ? (
                <div className={styles.example}>
                    <p className={styles.exampleText}>{example}</p>
                    {exampleTranslation && !hideTranslation ? (
                        <p className={styles.exampleText}>
                            {exampleTranslation}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </>
    );
    const cn = [styles.root, onClick ? styles.interactive : '', className]
        .filter(Boolean)
        .join(' ');
    return onClick ? (
        <button type='button' onClick={onClick} className={cn}>
            {content}
        </button>
    ) : (
        <article aria-label={term} className={cn}>
            {content}
        </article>
    );
}
