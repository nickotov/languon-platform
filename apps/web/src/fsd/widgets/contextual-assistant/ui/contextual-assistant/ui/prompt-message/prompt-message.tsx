import { useState } from 'react';
import type {
    ConversationPromptMention,
    ExerciseActivityId,
} from '@languon/contracts';
import { ExerciseActivityPreview } from '@/fsd/entities/learning-blocks';
import type { Locale } from '@/fsd/shared/i18n';
import styles from '../../../styles/contextual-assistant-prompt-common.module.css';

export function PromptMessage({
    content,
    mentions,
    locale,
}: {
    content: string;
    mentions: ConversationPromptMention[];
    locale: Locale;
}) {
    const [preview, setPreview] = useState<ExerciseActivityId | null>(null);
    function close() {
        setPreview(null);
    }

    const pieces = [];
    let cursor = 0;
    for (const mention of mentions) {
        pieces.push(content.slice(cursor, mention.start));
        pieces.push(
            <Mention
                key={mention.start}
                label={content.slice(mention.start, mention.end)}
                mention={mention}
                onPreview={setPreview}
            />,
        );

        cursor = mention.end;
    }

    pieces.push(content.slice(cursor));

    return (
        <>
            <span className={styles.message}>{pieces}</span>
            {preview && (
                <ExerciseActivityPreview
                    activityId={preview}
                    locale={locale}
                    open
                    onClose={close}
                />
            )}
        </>
    );
}

function Mention({
    mention,
    label,
    onPreview,
}: {
    mention: ConversationPromptMention;
    label: string;
    onPreview(id: ExerciseActivityId): void;
}) {
    function show() {
        if (mention.kind === 'exercise') {
            onPreview(mention.activityId);
        }
    }

    if (mention.kind === 'exercise') {
        return (
            <button
                type='button'
                data-prompt-mention='exercise'
                onClick={show}
                aria-label={`Preview exercise: ${label}`}
            >
                {label}
            </button>
        );
    }

    return <span data-prompt-mention='block'>{label}</span>;
}
