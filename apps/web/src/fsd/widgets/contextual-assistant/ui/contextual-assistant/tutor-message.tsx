import { Check } from 'lucide-react';
import type {
    ConversationEditorTarget,
    ConversationTurn,
} from '@languon/contracts';
import {
    conversationCopy,
    CopiedMaterial,
    type ConversationUIMessage,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import { ResponseLimitNotice } from './response-limit-notice';
import { ResponseActions } from './response-actions';
import { messagesCopy } from '../../lib/messages-copy';
import { ConversationErrorNotice } from './conversation-error-notice';
import { ChatMarkdown } from './chat-markdown';
import { useStreamingText } from '../../hooks/use-streaming-text';
import type {
    WorkspaceAssistantProps,
    WorkspaceProposalAction,
} from '../../types';
import { WorkspaceProposal } from './workspace-proposal';
import {
    WorkspaceMessageMaterials,
    WorkspaceMessagePassage,
} from './workspace-message-materials';
import styles from './conversation-messages.module.css';

export function TutorMessage({
    message,
    changed,
    turn,
    active,
    hasAssistant,
    question,
    onRetry,
    onContinue,
    onPropose,
    onAcceptWorkspaceProposal,
    workspaceTargetId,
    workspaceAnchor,
    proposalRootId,
    onReviewProposal,
    workspace,
    reviewingProposalId,
    onReviewingProposal,
}: {
    message: ConversationUIMessage;
    changed: boolean;
    turn: ConversationTurn | undefined;
    active: boolean;
    hasAssistant: boolean;
    question: string;
    onRetry(turn: ConversationTurn): void;
    onContinue?: (() => void) | undefined;
    onPropose?: ((message?: ConversationUIMessage) => void) | undefined;
    workspaceTargetId?: string | undefined;
    workspaceAnchor?: ConversationEditorTarget | undefined;
    proposalRootId?: string | undefined;
    onReviewProposal?: (() => void) | undefined;
    workspace?: WorkspaceAssistantProps | undefined;
    reviewingProposalId?: string | null | undefined;
    onReviewingProposal?: ((id: string | null) => void) | undefined;
    onAcceptWorkspaceProposal?:
        | ((
              text: string,
              action: WorkspaceProposalAction,
              turnId: string | null,
              anchor?: ConversationEditorTarget,
              trackedTargetId?: string,
              format?: 'markdown' | 'plain-text',
          ) => Promise<
              'applied' | 'changed' | 'missing' | 'invalid' | undefined
          >)
        | undefined;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const labels = messagesCopy(locale);
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
    const hasBlockProposal = canonical.toolCalls.some(
        (tool) =>
            tool.name === 'propose_learning_blocks' &&
            tool.state === 'succeeded',
    );
    const workspaceMaterials = isUser && Boolean(onAcceptWorkspaceProposal);
    const copiedAttachments = materials.map((material) => material.data);
    const selectedPassage = workspaceMaterials
        ? canonical.editorTarget?.originalText
        : undefined;
    const failed =
        turn && (turn.status === 'failed' || turn.status === 'cancelled');
    const incomplete = !isUser && failed;
    const failedBeforeAnswer = isUser && failed && !hasAssistant;
    const failureLabel = `${copy.incomplete}: ${question}`;
    function propose() {
        onPropose?.(message);
    }
    const proposalAction = onPropose ? propose : undefined;
    function retry() {
        if (turn) onRetry(turn);
    }
    return (
        <article className={styles.message}>
            {changed && <div className={styles.divider}>{copy.changed}</div>}
            <div className={isUser ? styles.userGroup : styles.answer}>
                {selectedPassage && (
                    <WorkspaceMessagePassage content={selectedPassage} />
                )}
                {copiedAttachments.length > 0 && workspaceMaterials && (
                    <WorkspaceMessageMaterials
                        attachments={copiedAttachments}
                    />
                )}
                {materials.length > 0 && !workspaceMaterials && (
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
                        workspace={Boolean(onAcceptWorkspaceProposal)}
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
                {complete && turn?.outputLimitReached && onContinue && (
                    <ResponseLimitNotice
                        onContinue={onContinue}
                        disabled={active}
                    />
                )}
                {complete && onAcceptWorkspaceProposal && !hasBlockProposal && (
                    <WorkspaceProposal
                        content={text}
                        targetId={workspaceTargetId}
                        anchor={workspaceAnchor}
                        turnId={canonical.turnId}
                        onAccept={onAcceptWorkspaceProposal}
                        rootId={proposalRootId}
                        onReview={onReviewProposal}
                        workspace={workspace}
                        proposalId={message.id}
                        reviewingProposalId={reviewingProposalId}
                        onReviewingProposal={onReviewingProposal}
                    />
                )}
                {complete && (
                    <div className={styles.actions}>
                        <ResponseActions
                            text={text}
                            onPropose={proposalAction}
                            canPropose={!onAcceptWorkspaceProposal}
                            disabled={active}
                        />
                    </div>
                )}
            </div>
        </article>
    );
}
