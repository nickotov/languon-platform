import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import type {
    ConversationDetail,
    ConversationEditorTarget,
    ConversationTurn,
    ConversationSource,
} from '@languon/contracts';
import {
    conversationCopy,
    type ConversationUIMessage,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { useMessageScroll } from '../../hooks/use-message-scroll';
import { messagesCopy } from '../../lib/messages-copy';
import { messageScrollSignature } from '../../lib/message-scroll-signature';
import { TutorMessage } from './tutor-message';
import { ConversationEmpty } from './conversation-empty';
import { TutorActivity } from '../tutor-activity/tutor-activity';
import type {
    WorkspaceAssistantProps,
    WorkspaceProposalAction,
} from '../../types';
import styles from './conversation-messages.module.css';

export function ConversationMessages({
    detail,
    uiMessages,
    active,
    pending = false,
    onRetry,
    onContinue,
    onPropose,
    onSuggest,
    children,
    sourceKind,
    contextLabel,
    workspaceTargets,
    onAcceptWorkspaceProposal,
    proposalRootId,
    onReviewProposal,
    workspace,
}: {
    detail: ConversationDetail;
    uiMessages: ConversationUIMessage[];
    active: boolean;
    pending?: boolean;
    onRetry(turn: ConversationTurn): void;
    onContinue?: (() => void) | undefined;
    onPropose(message?: ConversationUIMessage): void;
    onSuggest?: (text: string) => void;
    children?: ReactNode;
    sourceKind?: ConversationSource['kind'] | undefined;
    contextLabel?: string | undefined;
    workspaceTargets?: Map<string, string> | undefined;
    proposalRootId?: string | undefined;
    onReviewProposal?: (() => void) | undefined;
    workspace?: WorkspaceAssistantProps | undefined;
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
    const [reviewingProposalId, setReviewingProposalId] = useState<
        string | null
    >(null);
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
    const activeTurn = detail.turns.find(
        (turn) => turn.status === 'queued' || turn.status === 'running',
    );
    const answer = uiMessages.find(
        (message) =>
            message.role === 'assistant' &&
            message.metadata?.turnId === activeTurn?.id,
    );
    const activeText =
        answer?.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('') ?? '';
    const currentTool = answer?.parts.find(
        (part) =>
            (part.type === 'tool-read_source_context' ||
                part.type === 'tool-propose_knowledge_note') &&
            part.state === 'input-available',
    );
    let tool: 'reading' | 'preparing' | undefined;
    if (currentTool?.type === 'tool-read_source_context') tool = 'reading';
    if (currentTool?.type === 'tool-propose_knowledge_note') tool = 'preparing';
    const responding = active || pending;
    const queued = pending || activeTurn?.status === 'queued';
    return (
        <div
            className={styles.frame}
            data-workspace={Boolean(onAcceptWorkspaceProposal)}
        >
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
                            workspace={Boolean(onAcceptWorkspaceProposal)}
                            editorEmpty={workspace?.editorCharacters === 0}
                        />
                    )}
                    {messages.map(({ message, changed, turn }) => (
                        <TutorMessage
                            key={message.id}
                            message={message}
                            changed={changed}
                            turn={turn}
                            active={active || pending}
                            hasAssistant={assistantTurns.has(
                                message.metadata?.turnId,
                            )}
                            question={
                                questions.get(message.metadata!.turnId) ?? ''
                            }
                            onRetry={onRetry}
                            onContinue={onContinue}
                            onPropose={onPropose}
                            workspaceTargetId={
                                message.metadata?.turnId
                                    ? workspaceTargets?.get(
                                          message.metadata.turnId,
                                      )
                                    : undefined
                            }
                            workspaceAnchor={message.metadata?.editorTarget}
                            onAcceptWorkspaceProposal={
                                onAcceptWorkspaceProposal
                            }
                            proposalRootId={proposalRootId}
                            onReviewProposal={onReviewProposal}
                            workspace={workspace}
                            reviewingProposalId={reviewingProposalId}
                            onReviewingProposal={setReviewingProposalId}
                        />
                    ))}
                    <TutorActivity
                        active={responding}
                        queued={queued}
                        text={activeText}
                        tool={tool}
                    />
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
