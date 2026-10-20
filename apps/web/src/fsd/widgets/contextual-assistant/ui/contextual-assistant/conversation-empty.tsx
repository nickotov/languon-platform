import { ArrowUpRight, CornerDownRight } from 'lucide-react';
import type { ConversationSource } from '@languon/contracts';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { emptyStateCopy } from '../../lib/empty-state-copy';
import { messagesCopy } from '../../lib/messages-copy';
import { workspaceCopy } from '../../lib/workspace-copy';
import styles from './conversation-messages.module.css';

export function ConversationEmpty({
    onSuggest,
    sourceKind,
    contextLabel,
    workspace = false,
    editorEmpty = false,
}: {
    onSuggest?: ((text: string) => void) | undefined;
    sourceKind?: ConversationSource['kind'] | undefined;
    contextLabel?: string | undefined;
    workspace?: boolean;
    editorEmpty?: boolean;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const labels = messagesCopy(locale);
    const workspaceText = workspaceCopy(locale);
    const sourceCopy = sourceKind ? emptyStateCopy(locale, sourceKind) : null;
    let heading = labels.intro;
    if (sourceCopy && contextLabel)
        heading = `${sourceCopy.heading} “${contextLabel}”`;
    if (workspace)
        heading = editorEmpty
            ? workspaceText.emptyHeading
            : workspaceText.heading;
    const intro = workspace
        ? editorEmpty
            ? workspaceText.emptyIntro
            : workspaceText.intro
        : (sourceCopy?.intro ?? copy.empty);
    let suggestions = sourceCopy?.suggestions ?? [
        labels.suggestion,
        labels.suggestionTwo,
        labels.suggestionThree,
    ];
    if (workspace)
        suggestions = editorEmpty
            ? workspaceText.emptyPrompts
            : workspaceText.prompts;
    return (
        <section className={workspace ? styles.workspaceEmpty : styles.empty}>
            <h3>{heading}</h3>
            <p>{intro}</p>
            {onSuggest && (
                <>
                    <ul className={styles.suggestions}>
                        {suggestions.map((text) => (
                            <Suggestion
                                key={text}
                                text={text}
                                onSuggest={onSuggest}
                                workspace={workspace}
                            />
                        ))}
                    </ul>
                    {!workspace && <small>{labels.hint}</small>}
                </>
            )}
        </section>
    );
}
function Suggestion({
    text,
    onSuggest,
    workspace,
}: {
    workspace: boolean;
    text: string;
    onSuggest(text: string): void;
}) {
    function choose() {
        onSuggest(text);
    }
    return (
        <li>
            <button
                type='button'
                className={styles.suggestion}
                onClick={choose}
            >
                {!workspace && <CornerDownRight size={14} aria-hidden='true' />}
                <span>{text}</span>
                {workspace && <ArrowUpRight size={16} aria-hidden='true' />}
            </button>
        </li>
    );
}
