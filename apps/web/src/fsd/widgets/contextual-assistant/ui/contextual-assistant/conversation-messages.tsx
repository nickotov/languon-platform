import type { ConversationDetail, ConversationTurn } from '@languon/contracts';
import {
    conversationCopy,
    CopiedMaterial,
    type ConversationUIMessage,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import { ConversationErrorNotice } from './conversation-error-notice';
import { ChatMarkdown } from './chat-markdown';
import styles from './contextual-assistant.module.css';

export function ConversationMessages({
    detail,
    uiMessages,
    active,
    onRetry,
    onPropose,
}: {
    detail: ConversationDetail;
    uiMessages: ConversationUIMessage[];
    active: boolean;
    onRetry(turn: ConversationTurn): void;
    onPropose(): void;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    let previousVersion: string | null = null;
    const messages = uiMessages
        .filter((message) => Boolean(message.metadata))
        .map((uiMessage) => {
            const message = uiMessage.metadata!;
            const changed =
                message.role === 'user' &&
                previousVersion !== null &&
                message.sourceVersion !== null &&
                previousVersion !== message.sourceVersion;
            if (message.role === 'user')
                previousVersion = message.sourceVersion;
            return { message: uiMessage, changed };
        });
    const failed = detail.turns
        .filter(
            (turn) => turn.status === 'failed' || turn.status === 'cancelled',
        )
        .map((turn) => ({
            turn,
            question:
                detail.messages.find(
                    (message) =>
                        message.turnId === turn.id && message.role === 'user',
                )?.content ?? '',
        }));
    const hasAnswer = detail.messages.some(
        (message) =>
            message.role === 'assistant' && message.status === 'complete',
    );
    return (
        <div className={styles.messages}>
            {messages.length === 0 && <p>{copy.empty}</p>}
            {messages.map(({ message, changed }) => (
                <Message key={message.id} message={message} changed={changed} />
            ))}
            {failed.map(({ turn, question }) => (
                <FailedTurn
                    key={turn.id}
                    turn={turn}
                    question={question}
                    disabled={active}
                    onRetry={onRetry}
                />
            ))}
            {hasAnswer && (
                <Button
                    variant='secondary'
                    disabled={active}
                    onClick={onPropose}
                >
                    {copy.propose}
                </Button>
            )}
            {detail.turns.map((turn) => (
                <Usage key={turn.id} turn={turn} />
            ))}
        </div>
    );
}
function Message({
    message,
    changed,
}: {
    message: ConversationUIMessage;
    changed: boolean;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const canonical = message.metadata;
    if (!canonical) return null;
    const isUser = message.role === 'user';
    const text = message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
    const materials = message.parts.filter(
        (part) => part.type === 'data-material',
    );
    const tools = message.parts.filter(
        (part) =>
            part.type === 'tool-read_source_context' ||
            part.type === 'tool-propose_knowledge_note',
    );
    return (
        <article className={styles.message}>
            {changed && <p className={styles.notice}>{copy.changed}</p>}
            {canonical.sourceProvenance === 'draft' && (
                <p className={styles.notice}>{copy.draftLabel}</p>
            )}
            {isUser ? (
                <p className={styles.user} dir='auto'>
                    {text}
                </p>
            ) : (
                <ChatMarkdown content={text} />
            )}
            {materials.map(({ data: item }) => (
                <CopiedMaterial
                    key={item.id}
                    attachment={item}
                    caption={isUser ? copy.copied : copy.material}
                />
            ))}
            {tools.map((tool) => (
                <p
                    key={tool.toolCallId}
                    className={styles.notice}
                    role='status'
                >
                    {tool.type === 'tool-read_source_context'
                        ? copy.reading
                        : copy.preparingNote}{' '}
                    ·{' '}
                    {tool.state === 'output-error'
                        ? copy.toolFailed
                        : tool.state === 'output-available'
                          ? copy.toolDone
                          : copy.running}
                </p>
            ))}
            {canonical.status === 'incomplete' && (
                <p className={styles.notice}>{copy.incomplete}</p>
            )}
        </article>
    );
}
function FailedTurn({
    turn,
    question,
    disabled,
    onRetry,
}: {
    turn: ConversationTurn;
    question: string;
    disabled: boolean;
    onRetry(turn: ConversationTurn): void;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    function retry() {
        onRetry(turn);
    }
    const label = `${copy.incomplete}: ${question}`;
    const hasFailure = turn.status === 'failed';
    return (
        <section aria-label={label}>
            <p className={styles.notice}>{copy.incomplete}</p>
            <p dir='auto'>{question}</p>
            {hasFailure ? (
                <ConversationErrorNotice
                    code={turn.failureCode}
                    onRetry={retry}
                    disabled={disabled}
                />
            ) : (
                <Button variant='secondary' onClick={retry} disabled={disabled}>
                    {copy.retry}
                </Button>
            )}
        </section>
    );
}
function Usage({ turn }: { turn: ConversationTurn }) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    if (turn.status === 'queued' || turn.status === 'running') return null;
    const certainty = turn.usage.estimated ? copy.estimated : copy.reported;
    return (
        <p className={styles.notice}>
            {turn.modelId && (
                <span>
                    {copy.model}: {turn.modelId} ·{' '}
                </span>
            )}
            {copy.usage}: <span>{certainty}</span> · {copy.inputTokens}:{' '}
            {turn.usage.inputTokens} · {copy.outputTokens}:{' '}
            {turn.usage.outputTokens} · {copy.chargedCredits}:{' '}
            {turn.usage.chargedCredits}
        </p>
    );
}
