import type { CopiedAttachment } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { conversationCopy } from '../../lib/copy';
import styles from './copied-material.module.css';

export function CopiedMaterial({
    attachment,
    caption,
}: {
    attachment: CopiedAttachment;
    caption?: string;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const summary = caption
        ? `${attachment.label} · ${caption}`
        : attachment.label;
    if (attachment.kind !== 'dictionary-card')
        return (
            <details className={styles.root}>
                <summary dir='auto'>{summary}</summary>
                <div className={styles.text} dir='auto'>
                    {attachment.content}
                </div>
            </details>
        );
    const card = attachment.card;
    let transcriptionLabel = copy.transcription;
    if (card.transcriptionCustomLabel)
        transcriptionLabel += ` (${card.transcriptionCustomLabel})`;
    else if (card.transcriptionNotation)
        transcriptionLabel += ` (${card.transcriptionNotation})`;
    return (
        <details className={styles.root}>
            <summary dir='auto'>{summary}</summary>
            <dl className={styles.card}>
                <MaterialField
                    label={copy.source}
                    value={card.source}
                    language={card.sourceLanguage}
                />
                <MaterialField
                    label={copy.translation}
                    value={card.translation}
                    language={card.targetLanguage}
                />
                {card.definition !== undefined && (
                    <MaterialField
                        label={copy.definition}
                        value={card.definition}
                        language={card.definitionLanguage}
                    />
                )}
                {card.transcription !== undefined && (
                    <MaterialField
                        label={transcriptionLabel}
                        value={card.transcription}
                        language={card.sourceLanguage}
                    />
                )}
                {card.example !== undefined && (
                    <MaterialField
                        label={copy.example}
                        value={card.example}
                        language={card.exampleLanguage}
                    />
                )}
                {card.exampleTranslation !== undefined && (
                    <MaterialField
                        label={copy.exampleTranslation}
                        value={card.exampleTranslation}
                        language={card.exampleTranslationLanguage}
                    />
                )}
            </dl>
        </details>
    );
}

function MaterialField({
    label,
    value,
    language,
}: {
    label: string;
    value: string | null;
    language?: string | undefined;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    return (
        <div>
            <dt className={styles.label}>{label}</dt>
            <dd className={styles.value} lang={language} dir='auto'>
                {value || copy.emptyField}
            </dd>
        </div>
    );
}
