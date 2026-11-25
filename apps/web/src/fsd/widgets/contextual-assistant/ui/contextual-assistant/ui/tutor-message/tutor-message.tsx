import { memo, type ReactNode } from 'react';
import { canUseResponseInDocument } from '../../../../lib/response-document-use';
import { MessageBlockReferences } from '../block-reference-controls';
import type { KnowledgeBlockReference } from '@/fsd/features/knowledge-notes';
import { BookOpen, Check } from 'lucide-react';
import { KnowledgeContentProposalsForTurn } from '@/fsd/features/knowledge-notes';
import { DictionarySnippetsForTurn } from '@/fsd/features/dictionary-chat-snippets';
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
import { ResponseLimitNotice } from '../response-limit-notice/response-limit-notice';
import { ResponseActions } from '../response-actions/response-actions';
import { messagesCopy } from '../../../../lib/messages-copy';
import { ConversationErrorNotice } from '../conversation-error-notice/conversation-error-notice';
import { PromptMessage } from '../prompt-message/prompt-message';
import { ChatMarkdown } from '../chat-markdown/chat-markdown';
import { useStreamingText } from '../../../../hooks/use-streaming-text';
import type {
    WorkspaceAssistantProps,
    WorkspaceProposalAction,
} from '../../../../types';
import { WorkspaceProposal } from '../workspace-proposal/workspace-proposal';
import {
    WorkspaceMessageMaterials,
    WorkspaceMessagePassage,
} from '../workspace-message-materials';
import styles from '../../../styles/contextual-assistant-conversation-messages-common.module.css';

export const TutorMessage = memo(function TutorMessage({
    blocks = [],
    message,
    lesson,
    groupedProposalId,
    changed,
    turn,
    active,
    hasAssistant,
    question,
    onRetry,
    onContinue,
    onChooseReading,
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
    blocks?: KnowledgeBlockReference[] | undefined;
    message: ConversationUIMessage;
    lesson?: ReactNode;
    groupedProposalId?: string | undefined;
    changed: boolean;
    turn: ConversationTurn | undefined;
    active: boolean;
    hasAssistant: boolean;
    question: string;
    onRetry(turn: ConversationTurn): void;
    onChooseReading?: ((title: string) => void) | undefined;
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
    if (!canonical) {
        return null;
    }

    const isUser = message.role === 'user';
    const materials = message.parts.filter(
        (part) => part.type === 'data-material',
    );
    const tools = message.parts.filter(
        (part) =>
            part.type === 'tool-read_source_context' ||
            part.type === 'tool-propose_knowledge_note' ||
            part.type === 'tool-propose_learning_content' ||
            part.type === 'tool-propose_dictionary_snippet' ||
            part.type === 'tool-read_dictionary_snippet',
    );
    const complete = !isUser && canonical.status === 'complete';
    const hasContentProposal = canonical.toolCalls.some(
        (tool) =>
            tool.name === 'propose_learning_content' &&
            tool.state === 'succeeded',
    );
    const generationRun = Boolean(turn?.generationRunId);
    const canUseInDocument =
        !generationRun && canUseResponseInDocument(canonical);
    const workspaceMaterials = isUser && Boolean(onAcceptWorkspaceProposal);
    const copiedAttachments = materials.map((material) => material.data);
    const selectedPassage = workspaceMaterials
        ? canonical.editorTarget?.originalText
        : undefined;
    const failed =
        !generationRun &&
        turn &&
        (turn.status === 'failed' || turn.status === 'cancelled');

    if (
        !isUser &&
        !failed &&
        canonical.status === 'streaming' &&
        !text &&
        !materials.length &&
        !tools.length
    ) {
        return null;
    }

    const incomplete = !isUser && failed;
    const failedBeforeAnswer = isUser && failed && !hasAssistant;
    const failureLabel = `${copy.incomplete}: ${question}`;
    function propose() {
        onPropose?.(message);
    }

    const proposalAction = onPropose ? propose : undefined;
    function retry() {
        if (turn) {
            onRetry(turn);
        }
    }

    return (
        <article className={styles.message}>
            {changed && <div className={styles.divider}>{copy.changed}</div>}
            <div className={isUser ? styles.userGroup : styles.answer}>
                {isUser &&
                    !canonical.promptMentions?.length &&
                    (canonical.blockReferences?.length ?? 0) > 0 && (
                        <MessageBlockReferences
                            ids={canonical.blockReferences!}
                            available={blocks}
                        />
                    )}
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
                        if (
                            lesson &&
                            finished &&
                            tool.type === 'tool-propose_learning_content'
                        ) {
                            return null;
                        }

                        const error = tool.state === 'output-error';
                        let name = copy.preparingNote;
                        if (tool.type === 'tool-read_source_context') {
                            name = copy.reading;
                        }

                        if (tool.type === 'tool-propose_learning_content') {
                            name = labels.preparingBlocks;
                        }

                        if (tool.type === 'tool-propose_dictionary_snippet') {
                            name = labels.preparingCards;
                        }

                        if (tool.type === 'tool-read_dictionary_snippet') {
                            name = labels.readingSnippet;
                        }

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
                        <PromptMessage
                            content={canonical.content}
                            mentions={canonical.promptMentions ?? []}
                            locale={locale}
                        />
                    </p>
                ) : (
                    <ChatMarkdown
                        content={displayedText}
                        streaming={streaming}
                        workspace={Boolean(onAcceptWorkspaceProposal)}
                    />
                )}
                {complete &&
                !active &&
                onChooseReading &&
                canonical.responseMetadata?.kind === 'clarification' &&
                canonical.responseMetadata.readingChoices?.length ? (
                    <div className={styles.readingChoices}>
                        {canonical.responseMetadata.readingChoices.map(
                            (title) => (
                                <Button
                                    key={title}
                                    type='button'
                                    variant='secondary'
                                    size='compact'
                                    leadingIcon={
                                        <BookOpen size={14} aria-hidden />
                                    }
                                    onClick={() => onChooseReading(title)}
                                >
                                    <span
                                        dir='auto'
                                        className={styles.readingTitle}
                                    >
                                        {title}
                                    </span>
                                </Button>
                            ),
                        )}
                    </div>
                ) : null}
                {lesson}
                {!isUser && (
                    <KnowledgeContentProposalsForTurn
                        excludeProposalId={groupedProposalId}
                        turnId={canonical.turnId}
                    />
                )}
                {!isUser && (
                    <DictionarySnippetsForTurn turnId={canonical.turnId} />
                )}
                {(incomplete || failedBeforeAnswer) && (
                    <section
                        aria-label={failureLabel}
                        className={styles.incomplete}
                    >
                        <span className={styles.notice}>{copy.incomplete}</span>
                        {turn.status === 'failed' ? (
                            <ConversationErrorNotice
                                failedTurnCode={turn.failureCode}
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
                {complete &&
                    !generationRun &&
                    turn?.outputLimitReached &&
                    onContinue && (
                        <ResponseLimitNotice
                            onContinue={onContinue}
                            disabled={active}
                        />
                    )}
                {complete &&
                    onAcceptWorkspaceProposal &&
                    !hasContentProposal &&
                    canUseInDocument && (
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
                            canPropose={
                                !onAcceptWorkspaceProposal && !generationRun
                            }
                            disabled={active}
                        />
                    </div>
                )}
            </div>
        </article>
    );
});
