import { useMemo, type ReactNode } from 'react';
import { ArrowDown, CornerDownRight } from 'lucide-react';
import type {
    ConversationDetail,
    ConversationTurn,
    ConversationSource,
} from '@languon/contracts';
import {
    conversationCopy,
    type ConversationUIMessage,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { useMessageScroll } from '../../hooks/use-message-scroll';
import { emptyStateCopy } from '../../lib/empty-state-copy';
import { messagesCopy } from '../../lib/messages-copy';
import { messageScrollSignature } from '../../lib/message-scroll-signature';
import { TutorMessage } from './tutor-message';
import styles from './conversation-messages.module.css';

export function ConversationMessages({
    detail,
    uiMessages,
    active,
    onRetry,
    onPropose,
    onSuggest,
    children,
    sourceKind,
    contextLabel,
}: {
    detail: ConversationDetail;
    uiMessages: ConversationUIMessage[];
    active: boolean;
    onRetry(turn: ConversationTurn): void;
    onPropose(message?: ConversationUIMessage): void;
    onSuggest?: (text: string) => void;
    children?: ReactNode;
    sourceKind?: ConversationSource['kind'] | undefined;
    contextLabel?: string | undefined;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const labels = messagesCopy(locale);
    const signature = messageScrollSignature(uiMessages, detail.drafts.length);
    const turns = useMemo(
        () => new Map(detail.turns.map((turn) => [turn.id, turn])),
        [detail.turns],
    );
    const questions = useMemo(
        () =>
            new Map(
                detail.messages
                    .filter((item) => item.role === 'user')
                    .map((item) => [item.turnId, item.content]),
            ),
        [detail.messages],
    );
    const assistantTurns = new Set(
        uiMessages
            .filter((item) => item.role === 'assistant')
            .map((item) => item.metadata?.turnId),
    );
    const scroll = useMessageScroll(detail.conversation.id, signature);
    let previousVersion: string | null = null;
    const messages = uiMessages
        .filter((message) => Boolean(message.metadata))
        .map((message) => {
            const canonical = message.metadata!;
            const changed =
                canonical.role === 'user' &&
                previousVersion !== null &&
                canonical.sourceVersion !== null &&
                previousVersion !== canonical.sourceVersion;
            if (canonical.role === 'user')
                previousVersion = canonical.sourceVersion;
            return {
                message,
                changed,
                turn: canonical.turnId
                    ? turns.get(canonical.turnId)
                    : undefined,
            };
        });
    const waiting =
        active &&
        !messages.some(
            ({ message }) =>
                message.role === 'assistant' &&
                message.metadata?.status === 'streaming',
        );
    return (
        <div className={styles.frame}>
            <div
                ref={scroll.ref}
                onScroll={scroll.onScroll}
                className={styles.scroller}
                role='log'
                aria-label={copy.title}
                aria-live='off'
                aria-busy={active}
                tabIndex={0}
            >
                <div className={styles.messages}>
                    {messages.length === 0 && (
                        <ConversationEmpty
                            onSuggest={onSuggest}
                            sourceKind={sourceKind}
                            contextLabel={contextLabel}
                        />
                    )}
                    {messages.map(({ message, changed, turn }) => (
                        <TutorMessage
                            key={message.id}
                            message={message}
                            changed={changed}
                            turn={turn}
                            active={active}
                            hasAssistant={assistantTurns.has(
                                message.metadata?.turnId,
                            )}
                            question={
                                questions.get(message.metadata!.turnId) ?? ''
                            }
                            onRetry={onRetry}
                            onPropose={onPropose}
                        />
                    ))}
                    {waiting && (
                        <p className={styles.notice} role='status'>
                            {copy.running}
                        </p>
                    )}
                    {children}
                </div>
            </div>
            {scroll.showJump && (
                <div className={styles.jumpWrap}>
                    <button
                        className={styles.jump}
                        type='button'
                        onClick={scroll.jump}
                    >
                        <ArrowDown size={14} aria-hidden='true' />
                        {labels.jump}
                    </button>
                </div>
            )}
        </div>
    );
}

export function ConversationEmpty({
    onSuggest,
    sourceKind,
    contextLabel,
}: {
    onSuggest?: ((text: string) => void) | undefined;
    sourceKind?: ConversationSource['kind'] | undefined;
    contextLabel?: string | undefined;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const labels = messagesCopy(locale);
    const sourceCopy = sourceKind ? emptyStateCopy(locale, sourceKind) : null;
    const heading =
        sourceCopy && contextLabel
            ? `${sourceCopy.heading} “${contextLabel}”`
            : labels.intro;
    const intro = sourceCopy?.intro ?? copy.empty;
    const suggestions = sourceCopy?.suggestions ?? [
        labels.suggestion,
        labels.suggestionTwo,
        labels.suggestionThree,
    ];
    return (
        <section className={styles.empty}>
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
                            />
                        ))}
                    </ul>
                    <small>{labels.hint}</small>
                </>
            )}
        </section>
    );
}
function Suggestion({
    text,
    onSuggest,
}: {
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
                <CornerDownRight size={14} aria-hidden='true' />
                {text}
            </button>
        </li>
    );
}
