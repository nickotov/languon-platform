import { chatAdmissionInput } from './conversation-chat-admission-input';
import { generationAdmissionInput } from '../../ai/generation-admission-input';
import { persistConversationAdmissionMessages } from './conversation-admission-messages';
import { assertPreparedConversationCurrent } from './conversation-admission-snapshot';
import type { GenerationAdmission } from '../../../application/ports/generation-run';
import { generationFingerprint } from '../../../application/generation-run-revisions';
import {
    prepareGenerationAdmission,
    bindGenerationAdmission,
} from './generation-run-admission';
import {
    captureConversationBlockTarget,
    assertConversationEditorAuthority,
    assertConversationRetryAuthority,
} from './conversation-block-target';
import { prepareReferencedTutorMessage } from '../../../application/conversation-block-references';
import {
    ChatPreferencesSchema,
    ConversationActionQuoteSchema,
    type SubmitConversationTurnRequest,
} from '@languon/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { conversationRequestFingerprint } from './conversation-request-fingerprint';
import { conversationAdmissionBilling } from './conversation-admission-billing';
import { projectConversationSource } from '../../../application/conversation-source-context';
import { resolveConversationPortrait } from '../../../application/portrait-context';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
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
    turnView,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import {
    conversationsTable as chats,
    conversationMessagesTable as messages,
    conversationTurnsTable as turns,
} from './schema';

export async function conversationSubmit(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    input: SubmitConversationTurnRequest,
    generation?: GenerationAdmission,
) {
    // Preparing a potentially large dictionary/text context must not keep
    // the shared capacity fence occupied. This read transaction is closed
    // before admission starts; all authorization and revision checks are
    // repeated under the normal global-first write lock order below.
    const prepared =
        !input.editorContext && !input.retryOf && !generation
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
    const result = await conversationTransaction(
        persistence,
        async (tx) => {
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
            const fingerprint = generation
                ? generationFingerprint({
                      input: { ...input, confirmedQuoteId: undefined },
                      generation,
                  })
                : conversationRequestFingerprint(input);
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
                if (existing.requestFingerprint !== fingerprint) {
                    throw new ConversationError(
                        'idempotency_conflict',
                        'This request identifier has already been used.',
                    );
                }

                return turnView(existing);
            }

            if (prepared) {
                assertPreparedConversationCurrent(
                    prepared,
                    chat,
                    currentSnapshot,
                );
            }

            const generationPrepared = generation
                ? await prepareGenerationAdmission(
                      persistence,
                      tx,
                      access,
                      id,
                      generation,
                  )
                : undefined;

            if (generationPrepared?.sourceChanged) {
                return { sourceChanged: true as const };
            }

            const snapshot =
                generationPrepared?.snapshot ??
                prepared?.snapshot ??
                currentSnapshot;
            const [active] = await tx
                .select()
                .from(turns)
                .where(
                    and(
                        eq(turns.conversationId, id),
                        inArray(turns.status, ['queued', 'running']),
                    ),
                );

            if (active) {
                throw new ConversationError(
                    'response_active',
                    'A response is already active.',
                );
            }

            const sharedKnowledge = assertConversationEditorAuthority(
                chat.source,
                input,
            );
            const workspace =
                chat.sourceKind === 'knowledge' &&
                !sharedKnowledge &&
                !input.retryOf &&
                !generation;

            if (workspace) {
                assertWorkspaceTurnContext(
                    input,
                    persistence.dependencies.workspaceContextLimits ??
                        defaultWorkspaceContextLimits,
                );
            } else if (input.editorContext && chat.sourceKind !== 'knowledge') {
                throw new ConversationError(
                    'invalid_editor_context',
                    'Editor context is only available in a Knowledge workspace.',
                );
            }

            if (workspace && input.editorContext?.workingBranch) {
                const selectedBranch = input.editorContext.workingBranch;
                snapshot.blockTarget = await captureConversationBlockTarget(
                    tx,
                    chat.sourceId,
                    selectedBranch.id,
                    selectedBranch.version,
                );
            }

            let learnerContent = input.content;
            let promptMentions = input.promptMentions ?? [];
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

                if (previous?.generationRunId) {
                    throw conflict(
                        'Continue the existing lesson to reuse its completed sections.',
                    );
                }

                if (
                    !previous ||
                    !['failed', 'cancelled'].includes(previous.status)
                ) {
                    throw conflict(
                        'Only an incomplete response can be retried.',
                    );
                }

                const [original] = await tx
                    .select()
                    .from(messages)
                    .where(
                        and(
                            eq(messages.turnId, previous.id),
                            eq(messages.role, 'user'),
                        ),
                    );

                if (!original) {
                    throw conversationUnavailable();
                }

                learnerContent = original.content;
                promptMentions = original.promptMentions;
                learnerAttachments = original.attachments;
                retryModelContent = original.modelContent?.[0]?.modelContent;
                retryEditorTarget = original.editorTarget;
                assertConversationRetryAuthority(
                    chat.source,
                    previous.sourceSnapshot,
                );

                Object.assign(snapshot, previous.sourceSnapshot);
                if (snapshot.scope !== 'workspace') {
                    assertTutorCurrentMessageFits(
                        projectTutorUserMessage({
                            content: learnerContent,
                            attachments: learnerAttachments,
                        }),
                    );
                }
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
                    .set({
                        title: generatedTitle,
                        updatedAt: persistence.now(),
                    })
                    .where(eq(chats.id, id));

                if (chat.sourceKind === 'knowledge' && !sharedKnowledge) {
                    await persistence.dependencies.nameUntitledNote?.(
                        tx,
                        access.ownerId,
                        chat.sourceId,
                        generatedTitle,
                    );

                    const updated =
                        await persistence.dependencies.sources.resolve(
                            tx,
                            access.ownerId,
                            chat.source,
                            { authority },
                            false,
                        );

                    if (snapshot.blockTarget) {
                        // Server auto-title belongs to this admission; freeze its resulting version.
                        snapshot.blockTarget =
                            await captureConversationBlockTarget(
                                tx,
                                chat.sourceId,
                                snapshot.blockTarget.branchId,
                            );
                    }

                    snapshot.title = updated.snapshot.title;
                    snapshot.version =
                        snapshot.scope === 'workspace'
                            ? `draft:${updated.snapshot.version}`
                            : updated.snapshot.version;
                }
            }

            const modelContent =
                retryModelContent ??
                (generationPrepared
                    ? {
                          text: learnerContent,
                          generationRun: {
                              runId: generation!.runId,
                              revision: generation!.expectedRevision,
                              purpose: generation!.kind,
                          },
                      }
                    : undefined) ??
                prepareReferencedTutorMessage({
                    snapshot,
                    sourceKind: chat.sourceKind,
                    request: input,
                    content: learnerContent,
                    attachments: learnerAttachments,
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
                await conversationPortraitPolicy(
                    persistence,
                    tx,
                    access.ownerId,
                ),
            );
            const generationProjection = generationPrepared
                ? generationAdmissionInput(
                      generationPrepared.context,
                      learnerContent,
                      generation?.acknowledgedUncertainTurnId,
                  )
                : undefined;
            const { minimumInputBound, inputTokenBound } =
                generationProjection ??
                (await chatAdmissionInput(tx, id, {
                    message: {
                        id: input.requestId,
                        role: 'user' as const,
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
                }));

            const execution = await persistence.dependencies.admitTurn(tx, {
                ownerId: access.ownerId,
                turnId,
                conversationId: id,
                requestId: input.requestId,
                inputTokenBound,
                minimumInputBound,
                mayGenerateLesson:
                    generation?.kind === 'generation' ||
                    (!generation &&
                        chat.source.kind === 'knowledge' &&
                        !!snapshot.blockTarget),
                reserveToolContinuation:
                    !!snapshot.blockTarget ||
                    !!snapshot.dictionaryGenerationContext,
                fingerprint,
                ...(generation?.kind === 'generation'
                    ? {
                          forceConfirmation: !generation.automatic,
                          ...(generationPrepared?.generationAuthorization
                              ? {
                                    generationAuthorization:
                                        generationPrepared.generationAuthorization,
                                }
                              : {}),
                          ...(generationProjection
                              ? {
                                    minimumOutputTokens:
                                        generationProjection.minimumOutputTokens,
                                }
                              : {}),
                      }
                    : {}),
                ...(input.confirmedQuoteId
                    ? { confirmedQuoteId: input.confirmedQuoteId }
                    : {}),
            });

            if (execution.confirmationRequired) {
                return {
                    quote: ConversationActionQuoteSchema.parse(execution.quote),
                };
            }

            const now = persistence.now();
            const [turn] = await tx
                .insert(turns)
                .values({
                    id: turnId,
                    generationRunId: generation?.runId ?? null,
                    conversationId: id,
                    ownerId: access.ownerId,
                    requestId: input.requestId,
                    requestFingerprint: fingerprint,
                    status: 'queued',
                    authority,
                    sourceSnapshot: snapshot,
                    preferences: personalization.preferences,
                    execution: generationPrepared?.commandNumber
                        ? {
                              ...execution,
                              generationCommandNumber:
                                  generationPrepared.commandNumber,
                              ...(generation?.acknowledgedUncertainTurnId
                                  ? {
                                        acknowledgedUncertainTurnId:
                                            generation.acknowledgedUncertainTurnId,
                                    }
                                  : {}),
                          }
                        : execution,
                    ...conversationAdmissionBilling(execution),
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

            if (generation && generationPrepared) {
                await bindGenerationAdmission(
                    persistence,
                    tx,
                    turnId,
                    execution,
                    generation,
                    generationPrepared,
                );
            }

            await persistConversationAdmissionMessages(tx, {
                turn: turn!,
                learnerContent,
                learnerAttachments,
                modelContent,
                promptMentions,
                editorTarget,
                now,
            });

            return turnView(turn!);
        },
        true,
        (tx) => persistence.dependencies.admitTurn.prepare?.(tx),
    );

    if ('sourceChanged' in result) {
        throw new ConversationError(
            'source_changed',
            'The lesson sources changed. Choose whether to keep the captured material or refresh it.',
        );
    }

    if ('quote' in result) {
        throw new ConversationActionConfirmationRequired(result.quote);
    }

    return result;
}
