import { useState } from 'react';
import { Check, Copy, NotebookPen, ChevronUp } from 'lucide-react';
import type { ConversationTurn } from '@languon/contracts';
import {
    conversationCopy,
    CopiedMaterial,
    type ConversationUIMessage,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Popover,
    PopoverTrigger,
    PopoverContent,
} from '@/fsd/shared/ui';
import { messagesCopy } from '../../lib/messages-copy';
import { ConversationErrorNotice } from './conversation-error-notice';
import { ChatMarkdown } from './chat-markdown';
import { useStreamingText } from '../../hooks/use-streaming-text';
import styles from './conversation-messages.module.css';

export function TutorMessage({
    message,
    changed,
    turn,
    active,
    hasAssistant,
    question,
    onRetry,
    onPropose,
}: {
    message: ConversationUIMessage;
    changed: boolean;
    turn: ConversationTurn | undefined;
    active: boolean;
    hasAssistant: boolean;
    question: string;
    onRetry(turn: ConversationTurn): void;
    onPropose(message?: ConversationUIMessage): void;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const labels = messagesCopy(locale);
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const canonical = message.metadata;
    const streaming = Boolean(
        active &&
        turn &&
        turn.status === 'running' &&
        message.role === 'assistant' &&
        canonical?.status === 'streaming',
    );
    const text = message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
    const displayedText = useStreamingText(text, streaming);
    if (!canonical) return null;
    const isUser = message.role === 'user';
    const materials = message.parts.filter(
        (part) => part.type === 'data-material',
    );
    const tools = message.parts.filter(
        (part) =>
            part.type === 'tool-read_source_context' ||
            part.type === 'tool-propose_knowledge_note',
    );
    const complete = !isUser && canonical.status === 'complete';
    const failed =
        turn && (turn.status === 'failed' || turn.status === 'cancelled');
    const incomplete = !isUser && failed;
    const failedBeforeAnswer = isUser && failed && !hasAssistant;
    const showUsage = Boolean(
        turn && (complete || incomplete || failedBeforeAnswer),
    );
    const failureLabel = `${copy.incomplete}: ${question}`;
    async function copyAnswer() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setCopyError(false);
        } catch {
            setCopyError(true);
        }
    }
    function propose() {
        onPropose(message);
    }
    function retry() {
        if (turn) onRetry(turn);
    }
    const copyLabel = copied ? labels.copied : labels.copy;
    return (
        <article className={styles.message}>
            {changed && <div className={styles.divider}>{copy.changed}</div>}
            <div className={isUser ? styles.userGroup : styles.answer}>
                {materials.length > 0 && (
                    <details className={styles.materials}>
                        <summary>
                            {isUser ? copy.copied : copy.material} ·{' '}
                            {materials.length}
                        </summary>
                        {!isUser && (
                            <p className={styles.notice}>{labels.materials}</p>
                        )}
                        {materials.map(({ data: item }) => (
                            <CopiedMaterial
                                key={item.id}
                                attachment={item}
                                caption={item.label}
                            />
                        ))}
                    </details>
                )}
                {!isUser &&
                    tools.map((tool) => {
                        const finished = tool.state === 'output-available';
                        const error = tool.state === 'output-error';
                        const name =
                            tool.type === 'tool-read_source_context'
                                ? copy.reading
                                : copy.preparingNote;
                        const state = error ? copy.toolFailed : copy.running;
                        return (
                            <p key={tool.toolCallId} className={styles.notice}>
                                {finished ? (
                                    <Check size={14} aria-hidden='true' />
                                ) : null}
                                {name} · {finished ? copy.toolDone : state}
                            </p>
                        );
                    })}
                {isUser ? (
                    <p className={styles.user} dir='auto'>
                        {text}
                    </p>
                ) : (
                    <ChatMarkdown
                        content={displayedText}
                        streaming={streaming}
                    />
                )}
                {canonical.sourceProvenance === 'draft' && (
                    <span className={styles.notice}>{copy.draftLabel}</span>
                )}
                {(incomplete || failedBeforeAnswer) && (
                    <section
                        aria-label={failureLabel}
                        className={styles.incomplete}
                    >
                        <span className={styles.notice}>{copy.incomplete}</span>
                        {turn.status === 'failed' ? (
                            <ConversationErrorNotice
                                code={turn.failureCode}
                                onRetry={retry}
                                disabled={active}
                            />
                        ) : (
                            <Button
                                variant='secondary'
                                onClick={retry}
                                disabled={active}
                            >
                                {copy.retry}
                            </Button>
                        )}
                    </section>
                )}
                {(complete || showUsage) && (
                    <div className={styles.actions}>
                        {complete && (
                            <>
                                <button
                                    type='button'
                                    className={styles.quiet}
                                    onClick={copyAnswer}
                                >
                                    {copied ? (
                                        <Check size={14} aria-hidden='true' />
                                    ) : (
                                        <Copy size={14} aria-hidden='true' />
                                    )}
                                    {copyLabel}
                                </button>
                                <button
                                    type='button'
                                    className={styles.quiet}
                                    onClick={propose}
                                    disabled={active}
                                >
                                    <NotebookPen size={14} aria-hidden='true' />
                                    {copy.propose}
                                </button>
                            </>
                        )}
                        {showUsage && turn && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button
                                        type='button'
                                        className={styles.quiet}
                                    >
                                        <ChevronUp
                                            size={14}
                                            aria-hidden='true'
                                        />
                                        {copy.chargedCredits}:{' '}
                                        {turn.usage.chargedCredits}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent
                                    side='top'
                                    align='end'
                                    aria-label={copy.usage}
                                    className={styles.usagePopover}
                                >
                                    <dl className={styles.usageDetails}>
                                        <dt>{copy.model}</dt>
                                        <dd>{turn.modelId}</dd>
                                        <dt>{copy.inputTokens}</dt>
                                        <dd>{turn.usage.inputTokens}</dd>
                                        <dt>{copy.outputTokens}</dt>
                                        <dd>{turn.usage.outputTokens}</dd>
                                        <dt>{copy.usage}</dt>
                                        <dd>
                                            {turn.usage.estimated
                                                ? copy.estimated
                                                : copy.reported}
                                        </dd>
                                    </dl>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                )}
                {copyError && (
                    <p role='status' className={styles.notice}>
                        {labels.copyFailed}
                    </p>
                )}
            </div>
        </article>
    );
}
