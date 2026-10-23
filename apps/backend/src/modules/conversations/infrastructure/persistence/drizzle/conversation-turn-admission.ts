import {
    ChatPreferencesSchema,
    ConversationActionQuoteSchema,
    type SubmitConversationTurnRequest,
} from '@languon/contracts';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { formatCreditMilli } from '../../../../ai-credits/domain/exact-credit-amount';
import { projectConversationSource } from '../../../application/conversation-source-context';
import { resolveConversationPortrait } from '../../../application/portrait-context';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import type { TutorMemoryMessage } from '../../../application/ports/tutor-runner';
import { tutorAdmissionInputBytes } from '../../../application/tutor-context-budget';
import {
    assertTutorCurrentMessageFits,
    projectTutorUserMessage,
} from '../../../application/tutor-message-context';
import {
    assertWorkspaceTurnContext,
    defaultWorkspaceContextLimits,
    firstThreeWords,
} from '../../../application/workspace-turn-context';
import {
    ConversationActionConfirmationRequired,
    ConversationError,
    conversationUnavailable,
} from '../../../domain/conversation';
import {
    conversationAuthorize,
    conversationPortraitPolicy,
    conversationReadTransaction,
    conversationTransaction,
} from './conversation-persistence-authority';
import type { MessageRow } from './conversation-persistence-context';
import {
    conflict,
    messageView,
    sameConversationSourceRevision,
    turnView,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import {
    conversationsTable as chats,
    conversationEventsTable as events,
    conversationMemoryTable as memory,
    conversationMessagesTable as messages,
    conversationTurnsTable as turns,
} from './schema';

export async function conversationSubmit(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    input: SubmitConversationTurnRequest,
) {
    // Preparing a potentially large dictionary/text context must not keep
    // the shared capacity fence occupied. This read transaction is closed
    // before admission starts; all authorization and revision checks are
    // repeated under the normal global-first write lock order below.
    const prepared =
        !input.editorContext && !input.retryOf
            ? await conversationReadTransaction(persistence, (tx) =>
                  conversationAuthorize(
                      persistence,
                      tx,
                      access,
                      id,
                      true,
                      '',
                      false,
                      false,
                  ),
              )
            : undefined;
    const result = await conversationTransaction(persistence, async (tx) => {
        const {
            chat,
            authority,
            snapshot: currentSnapshot,
        } = await conversationAuthorize(
            persistence,
            tx,
            access,
            id,
            false,
            '',
            true,
            true,
            prepared?.chat.source,
        );
        const fingerprint = createHash('sha256')
            .update(JSON.stringify({ ...input, confirmedQuoteId: undefined }))
            .digest('hex');
        const [existing] = await tx
            .select()
            .from(turns)
            .where(
                and(
                    eq(turns.conversationId, id),
                    eq(turns.requestId, input.requestId),
                ),
            );

        if (existing) {
            if (existing.requestFingerprint !== fingerprint)
                throw new ConversationError(
                    'idempotency_conflict',
                    'This request identifier has already been used.',
                );

            return turnView(existing);
        }

        if (prepared) {
            if (
                prepared.chat.version !== chat.version ||
                prepared.chat.title !== chat.title ||
                JSON.stringify(prepared.chat.preferences) !==
                    JSON.stringify(chat.preferences) ||
                JSON.stringify(prepared.chat.source) !==
                    JSON.stringify(chat.source) ||
                prepared.chat.sourceKind !== chat.sourceKind ||
                !sameConversationSourceRevision(
                    chat.sourceKind,
                    prepared.snapshot.version,
                    currentSnapshot.version,
                ) ||
                prepared.snapshot.title !== currentSnapshot.title ||
                prepared.snapshot.studiedLanguage !==
                    currentSnapshot.studiedLanguage
            )
                throw conflict(
                    'The conversation or its source changed while preparing your message. Review it and send again.',
                );
        }

        const snapshot = prepared?.snapshot ?? currentSnapshot;
        const [active] = await tx
            .select()
            .from(turns)
            .where(
                and(
                    eq(turns.conversationId, id),
                    inArray(turns.status, ['queued', 'running']),
                ),
            );

        if (active)
            throw new ConversationError(
                'response_active',
                'A response is already active.',
            );
        const workspace = chat.sourceKind === 'knowledge' && !input.retryOf;
        if (workspace)
            assertWorkspaceTurnContext(
                input,
                persistence.dependencies.workspaceContextLimits ??
                    defaultWorkspaceContextLimits,
            );
        else if (input.editorContext && chat.sourceKind !== 'knowledge')
            throw new ConversationError(
                'invalid_editor_context',
                'Editor context is only available in a Knowledge workspace.',
            );
        let learnerContent = input.content;
        let learnerAttachments = input.attachments;
        let retryModelContent: Record<string, unknown> | undefined;
        let retryEditorTarget: MessageRow['editorTarget'] = null;
        if (input.retryOf) {
            const [previous] = await tx
                .select()
                .from(turns)
                .where(
                    and(
                        eq(turns.id, input.retryOf),
                        eq(turns.conversationId, id),
                    ),
                );

            if (!previous || !['failed', 'cancelled'].includes(previous.status))
                throw conflict('Only an incomplete response can be retried.');
            const [original] = await tx
                .select()
                .from(messages)
                .where(
                    and(
                        eq(messages.turnId, previous.id),
                        eq(messages.role, 'user'),
                    ),
                );

            if (!original) throw conversationUnavailable();
            learnerContent = original.content;
            learnerAttachments = original.attachments;
            retryModelContent = original.modelContent?.[0]?.modelContent;
            retryEditorTarget = original.editorTarget;
            Object.assign(snapshot, previous.sourceSnapshot);
            if (snapshot.scope !== 'workspace')
                assertTutorCurrentMessageFits(
                    projectTutorUserMessage({
                        content: learnerContent,
                        attachments: learnerAttachments,
                    }),
                );
        }

        if (input.editorContext && !input.retryOf) {
            snapshot.provenance = 'draft';
            snapshot.version = `draft:${snapshot.version}`;
            snapshot.scope = 'workspace';
            snapshot.material = [];
        } else if (input.draftContext && !input.retryOf) {
            snapshot.provenance = 'draft';
            snapshot.version = `draft:${snapshot.version}`;
            snapshot.material = [
                {
                    id: chat.sourceId,
                    label: 'Current draft',
                    content: input.draftContext.content,
                },
            ];
        }

        if (!input.retryOf && !chat.title) {
            const generatedTitle = firstThreeWords(learnerContent);
            await tx
                .update(chats)
                .set({ title: generatedTitle, updatedAt: persistence.now() })
                .where(eq(chats.id, id));

            if (chat.sourceKind === 'knowledge') {
                await persistence.dependencies.nameUntitledNote?.(
                    tx,
                    access.ownerId,
                    chat.sourceId,
                    generatedTitle,
                );

                const updated = await persistence.dependencies.sources.resolve(
                    tx,
                    access.ownerId,
                    chat.source,
                    { authority },
                    false,
                );

                snapshot.title = updated.snapshot.title;
                snapshot.version =
                    snapshot.scope === 'workspace'
                        ? `draft:${updated.snapshot.version}`
                        : updated.snapshot.version;
            }
        }

        const modelContent =
            retryModelContent ??
            projectTutorUserMessage({
                content: learnerContent,
                attachments: learnerAttachments,
                ...(input.editorContext && !input.retryOf
                    ? { editorContext: input.editorContext }
                    : {}),
                source: {
                    sourceKind: chat.sourceKind,
                    version: snapshot.version,
                    provenance: snapshot.provenance,
                    title: snapshot.title,
                    studiedLanguage: snapshot.studiedLanguage,
                },
            });
        const editorTarget = input.retryOf
            ? retryEditorTarget
            : input.editorContext?.proposalTarget
              ? {
                    from: input.editorContext.proposalTarget.from,
                    to: input.editorContext.proposalTarget.to,
                    originalText:
                        input.editorContext.proposalTarget.originalText,
                    documentHash:
                        input.editorContext.proposalTarget.documentHash,
                    proposalMode: input.editorContext.proposalTarget.mode,
                }
              : (input.editorContext?.editorTarget ?? null);

        // Reject synchronously before reserving credits or inserting queued
        // work. Accepted visible copies are retained whole and unchanged.
        assertTutorCurrentMessageFits(
            modelContent,
            snapshot.scope === 'workspace' ? 170_000 : undefined,
        );

        const turnId = randomUUID();
        const personalization = resolveConversationPortrait(
            ChatPreferencesSchema.parse(chat.preferences),
            await conversationPortraitPolicy(persistence, tx, access.ownerId),
        );
        const recent = await tx
            .select({
                modelContent: messages.modelContent,
                content: messages.content,
                attachments: messages.attachments,
            })
            .from(messages)
            .where(eq(messages.conversationId, id))
            .orderBy(desc(messages.createdAt))
            .limit(20);
        const retainedMemory = await tx
            .select({ value: memory.value })
            .from(memory)
            .where(eq(memory.conversationId, id));
        const inputTokenBound = tutorAdmissionInputBytes(
            {
                message: {
                    id: input.requestId,
                    role: 'user',
                    content: learnerContent,
                    attachments: learnerAttachments,
                    modelContent,
                    createdAt: persistence.now().toISOString(),
                    ...(editorTarget ? { editorTarget } : {}),
                },
                sourceContext: projectConversationSource(
                    chat.source.kind,
                    snapshot,
                    learnerContent,
                ).initialContext,
                preferences: personalization.preferences,
                ...(personalization.context
                    ? { portraitContext: personalization.context }
                    : {}),
            },
            recent,
            retainedMemory,
        );
        const execution = await persistence.dependencies.admitTurn(tx, {
            ownerId: access.ownerId,
            turnId,
            conversationId: id,
            requestId: input.requestId,
            inputTokenBound,
            fingerprint,
            ...(input.confirmedQuoteId
                ? { confirmedQuoteId: input.confirmedQuoteId }
                : {}),
        });

        if (execution.confirmationRequired)
            return {
                quote: ConversationActionQuoteSchema.parse(execution.quote),
            };
        const now = persistence.now();
        const [turn] = await tx
            .insert(turns)
            .values({
                id: turnId,
                conversationId: id,
                ownerId: access.ownerId,
                requestId: input.requestId,
                requestFingerprint: fingerprint,
                status: 'queued',
                authority,
                sourceSnapshot: snapshot,
                preferences: personalization.preferences,
                execution,
                ...(execution.actionAccountingVersion === 1
                    ? {
                          billing: {
                              state:
                                  execution.funding === 'customer'
                                      ? ('held' as const)
                                      : ('free' as const),
                              heldCredits: formatCreditMilli(
                                  BigInt(String(execution.heldCreditsMilli)),
                              ),
                              chargedCredits: null,
                              measurement: null,
                          },
                      }
                    : {}),
                portraitContext: personalization.context ?? null,
                usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    chargedCredits: '0',
                    estimated: false,
                },
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        const userId = randomUUID();
        const modelUserMessage: TutorMemoryMessage = {
            id: userId,
            role: 'user',
            content: learnerContent,
            attachments: learnerAttachments,
            createdAt: now.toISOString(),
            modelContent,
        };
        const assistantId = randomUUID();
        const inserted = await tx
            .insert(messages)
            .values([
                {
                    id: userId,
                    conversationId: id,
                    turnId,
                    role: 'user',
                    content: learnerContent,
                    attachments: learnerAttachments,
                    modelContent: [modelUserMessage],
                    editorTarget,
                    status: 'complete',
                    sourceVersion: snapshot.version,
                    sourceProvenance: snapshot.provenance,
                    createdAt: now,
                },
                {
                    id: assistantId,
                    conversationId: id,
                    turnId,
                    role: 'assistant',
                    content: '',
                    attachments: [],
                    editorTarget,
                    status: 'streaming',
                    sourceVersion: snapshot.version,
                    sourceProvenance: snapshot.provenance,
                    createdAt: new Date(now.getTime() + 1),
                },
            ])
            .returning();
        const user = inserted.find((row) => row.id === userId);
        const assistant = inserted.find((row) => row.id === assistantId);
        if (!user || !assistant)
            throw new Error('Conversation messages were not persisted.');
        await tx.update(chats).set({ updatedAt: now }).where(eq(chats.id, id));
        await tx.insert(events).values([
            {
                conversationId: id,
                type: 'message',
                data: messageView(user),
                createdAt: now,
            },
            {
                conversationId: id,
                type: 'message',
                data: messageView(assistant),
                createdAt: now,
            },
            {
                conversationId: id,
                type: 'turn',
                data: turnView(turn!),
                createdAt: now,
            },
        ]);

        return turnView(turn!);
    });

    if ('quote' in result)
        throw new ConversationActionConfirmationRequired(result.quote);

    return result;
}
