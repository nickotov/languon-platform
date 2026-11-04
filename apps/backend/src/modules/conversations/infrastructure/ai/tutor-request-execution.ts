import { learningContentAuthoringOutputTokenLimit } from '../../application/learning-content-output-capacity';
import {
    serializeLearningContentBrief,
    deserializeLearningContentBrief,
} from '../../application/learning-content-transport';
import {
    frozenTutorTextSources,
    mergePendingLearningContentBrief,
    groundLearningContentBrief,
    readFrozenLearningBlocks,
} from '../../application/tutor-request-sources';
import {
    describeLearningProposal,
    loadLearningProposalCatalog,
    proposalSelectionNeedsClarification,
} from './tutor-request-proposals';
import {
    normalizeLearningContentDefaults,
    learningContentPresentation,
} from '../../application/learning-content-presentation';
import { randomUUID } from 'node:crypto';
import { learningContentCapabilities } from '../../application/learning-content-contract';
import {
    TutorRequestResolutionSchema,
    TutorRequestStateSchema,
    tutorRequestStateKey,
    type TutorRequestState,
} from '../../application/tutor-request-contract';
import { tutorMessageModelContent } from '../../application/tutor-message-context';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import { createLearningContentAuthoring } from './learning-content-authoring';
import {
    generateTutorObject,
    type createTutorRequestAgents,
} from './tutor-request-agents';

type RequestAgents = ReturnType<typeof createTutorRequestAgents>;

/** Returns null for ordinary streamed prose; all other paths complete without actor tool selection. */
export async function executeTutorRequest(
    input: TutorRunInput,
    agents: RequestAgents,
    signal: AbortSignal,
) {
    const stored = await input.memory.readState(tutorRequestStateKey);
    let pending = null;
    if (stored?.pending) {
        try {
            pending = deserializeLearningContentBrief(stored.pending);
        } catch {
            /* Corrupt bounded private state cannot authorize a source or generation. */
        }
    }

    const previousState = TutorRequestStateSchema.safeParse(
        stored ? { ...stored, pending } : stored,
    );
    const state: TutorRequestState = previousState.success
        ? previousState.data
        : { pending: null, proposals: [] };
    const loaded = await loadLearningProposalCatalog(input, state);
    state.proposals = loaded.catalog;
    const frozenSources = frozenTutorTextSources(input);
    const history = await input.memory.listMessages({
        offset: 0,
        limit: 6,
        order: 'desc',
    });
    const resolution = TutorRequestResolutionSchema.parse(
        await generateTutorObject({
            agent: agents.tutorRequestResolver,
            prompt: JSON.stringify({
                currentMessage: tutorMessageModelContent(input.message),
                source: input.sourceContext,
                preferences: input.preferences,
                approvedPortrait: input.portraitContext,
                editorTarget: input.message.editorTarget,
                availableTextSources: {
                    editor: frozenSources.editor?.length ?? 0,
                    selection: frozenSources.selection?.length ?? 0,
                },
                pendingBrief: state.pending
                    ? JSON.parse(
                          serializeLearningContentBrief(
                              state.pending,
                              frozenSources,
                          ),
                      )
                    : null,
                priorProposals: state.proposals,
                // Recent raw wording only. Exact artifacts are retrieved separately after planning.
                recentMessages: history.messages.reverse().map((message) => ({
                    role: message.role,
                    content: message.content.slice(0, 2_000),
                })),
                capabilities: learningContentCapabilities,
            }),
            schema: TutorRequestResolutionSchema,
            signal,
            operationId: `${input.operationId}:planning`,
            maxOutputTokens: 2048,
        }),
    );

    const saveState = () =>
        input.memory.writeState({
            [tutorRequestStateKey]: {
                ...state,
                pending: state.pending
                    ? JSON.parse(serializeLearningContentBrief(state.pending))
                    : null,
            },
        });
    const finishText = async (
        text: string,
        kind:
            | 'clarification'
            | 'limitation'
            | 'conversation'
            | 'generation'
            | 'revision',
    ) => {
        signal.throwIfAborted();
        await input.onResponseMetadata?.({ kind, documentUse: false });
        await input.onDelta({ messageId: input.operationId, text });
        await input.memory.saveMessages([
            input.message,
            {
                id: randomUUID(),
                role: 'assistant',
                content: text,
                createdAt: new Date().toISOString(),
            },
        ]);

        return { text };
    };

    if (resolution.kind === 'answer') {
        await input.onResponseMetadata?.({
            kind: resolution.purpose,
            documentUse:
                resolution.purpose === 'learning-explanation' &&
                resolution.documentUse,
        });

        return { stream: 'prose' as const, purpose: resolution.purpose };
    }

    if (
        resolution.kind === 'legacy-revision' ||
        resolution.kind === 'legacy-copy' ||
        resolution.kind === 'revise'
    ) {
        await input.onResponseMetadata?.({
            kind: 'revision',
            documentUse: false,
        });

        const mentioned = input.sourceContext.referencedBlocks;
        const ids = Array.isArray(mentioned)
            ? mentioned.flatMap((block: unknown) =>
                  block !== null &&
                  typeof block === 'object' &&
                  'id' in block &&
                  typeof block.id === 'string'
                      ? [block.id]
                      : [],
              )
            : [];

        const catalog = input.sourceContext.availableBlocks;
        const catalogIds = Array.isArray(catalog)
            ? catalog.flatMap((block: unknown) =>
                  block !== null &&
                  typeof block === 'object' &&
                  'id' in block &&
                  typeof block.id === 'string'
                      ? [block.id]
                      : [],
              )
            : [];
        const authorizedTargets = ids.length ? ids : catalogIds;
        if (
            resolution.kind === 'revise' &&
            !authorizedTargets.includes(resolution.targetBlockId)
        ) {
            throw new Error(
                'An update must target a block in the authorized frozen source.',
            );
        }

        const targetIds =
            resolution.kind === 'revise'
                ? [resolution.targetBlockId]
                : resolution.kind === 'legacy-copy'
                  ? resolution.sourceBlockIds
                  : ids;

        if (!targetIds.length && resolution.kind !== 'legacy-copy') {
            throw new Error('Select the learning block to revise.');
        }

        const material = await readFrozenLearningBlocks(input, targetIds);

        if (!material.length) {
            throw new Error('The exact source blocks to copy are unavailable.');
        }

        return {
            stream: 'legacy' as const,
            copy: resolution.kind === 'legacy-copy',
            material,
            ...(resolution.kind === 'revise'
                ? {
                      targetBlockId: resolution.targetBlockId,
                      revisionBrief: resolution.brief,
                  }
                : {}),
        };
    }

    if (resolution.kind === 'clarify') {
        state.pending = resolution.continuesPending
            ? mergePendingLearningContentBrief(state.pending, resolution.brief)
            : resolution.brief;

        await saveState();

        return finishText(resolution.question, 'clarification');
    }

    if (resolution.kind === 'abandon' || resolution.kind === 'unsupported') {
        if (resolution.kind === 'abandon') {
            state.pending = null;
            await saveState();
        }

        return finishText(
            resolution.answer,
            resolution.kind === 'unsupported' ? 'limitation' : 'conversation',
        );
    }

    const requestedBrief = resolution.continuesPending
        ? mergePendingLearningContentBrief(state.pending, resolution.brief)
        : resolution.brief;
    const sourceIds = [
        ...new Set([
            ...(resolution.sourceProposalIds ?? []),
            ...requestedBrief.tasks.flatMap((task) =>
                task.source?.kind === 'proposal'
                    ? [task.source.proposalId]
                    : [],
            ),
        ]),
    ];
    const clarifySource = async () => {
        const clarification = TutorRequestResolutionSchema.parse(
            await generateTutorObject({
                agent: agents.tutorRequestResolver,
                prompt: JSON.stringify({
                    instruction:
                        'Ask one concise localized clarification: the requested source is unavailable, outside the recent eight proposals, or ambiguous. Ask the learner to choose a recent source or restate/copy the material. Return kind clarify and preserve every known task.',
                    preferences: input.preferences,
                    currentMessage: input.message.content,
                    pendingBrief: JSON.parse(
                        serializeLearningContentBrief(
                            requestedBrief,
                            frozenSources,
                        ),
                    ),
                    priorProposals: state.proposals,
                }),
                schema: TutorRequestResolutionSchema,
                signal,
                operationId: `${input.operationId}:source-clarification`,
                maxOutputTokens: 2048,
            }),
        );

        if (clarification.kind !== 'clarify') {
            throw new Error('Specify which learning source to use.');
        }

        state.pending = requestedBrief;
        await saveState();

        return finishText(clarification.question, 'clarification');
    };

    if (
        proposalSelectionNeedsClarification(
            state.proposals,
            sourceIds,
            input.message.content,
            resolution.sourceMatch?.term,
        )
    ) {
        return clarifySource();
    }

    const sources = sourceIds.flatMap((id) => loaded.blocks.get(id) ?? []);
    if (sourceIds.some((id) => !loaded.blocks.has(id))) {
        return clarifySource();
    }

    let brief;
    try {
        brief = groundLearningContentBrief(
            requestedBrief,
            frozenSources,
            loaded.blocks,
            sources,
        );
    } catch {
        return clarifySource();
    }

    state.pending = brief;
    await saveState();
    const normalized = normalizeLearningContentDefaults(brief);
    const authorPreferences = {
        explanationLanguage:
            input.preferences.replyLanguage === 'auto'
                ? resolution.replyLanguage
                : input.preferences.replyLanguage,
        tone: input.preferences.tone,
        explanationLevel: input.preferences.explanationLevel,
        detail: input.preferences.detail,
        wording: input.preferences.wording,
        approach: input.preferences.approach,
    };
    const authoring = createLearningContentAuthoring({
        // Prior unapplied proposals are grounding material, not current-document reference authority.
        authorizedSources: [],
        generate: ({ prompt, schema, signal: authoringSignal }) =>
            generateTutorObject({
                agent: agents.learningContentAuthor,
                prompt: `${prompt}\nApplication authoring preferences (trusted server-validated settings): ${JSON.stringify(authorPreferences)}\nUse explanationLanguage for explanatory prose fields such as grammar rules, commentary and exercise explanations, applying detail, wording and approach independently. Keep every task's studied language and translation language unchanged. Preserve verbatim source passages, vocabulary terms, grammatical patterns, questions and prepared answers in their designated task languages.`,
                schema,
                signal: authoringSignal,
                operationId: `${input.operationId}:authoring`,
                maxOutputTokens: learningContentAuthoringOutputTokenLimit,
            }),
    });
    const result = await authoring.generate(normalized.brief, signal);
    if (result.status === 'needs-clarification') {
        if (result.code === 'word-count-conflict') {
            return finishText(
                learningContentPresentation({
                    status: 'needs-clarification',
                    brief,
                    preferences: input.preferences,
                    message: input.message.content,
                    replyLanguage: resolution.replyLanguage,
                    limitationCode: result.code,
                }),
                'clarification',
            );
        }

        // No author dispatch occurred. Repair the incomplete plan with one localized
        // clarification, retaining the original requirements instead of inventing defaults.
        const clarification = TutorRequestResolutionSchema.parse(
            await generateTutorObject({
                agent: agents.tutorRequestResolver,
                prompt: JSON.stringify({
                    instruction:
                        'The host found material requirements missing. Return kind clarify with one concise localized question. Do not generate or discard any known requirements.',
                    currentMessage: input.message.content,
                    preferences: input.preferences,
                    pendingBrief: JSON.parse(
                        serializeLearningContentBrief(brief, frozenSources),
                    ),
                    missing: result.missing,
                    capabilities: learningContentCapabilities,
                }),
                schema: TutorRequestResolutionSchema,
                signal,
                operationId: `${input.operationId}:clarification`,
                maxOutputTokens: 2048,
            }),
        );

        if (clarification.kind !== 'clarify') {
            throw new Error(
                'The learning request needs clarification before generation.',
            );
        }

        return finishText(clarification.question, 'clarification');
    }

    if (result.status === 'unsupported') {
        return finishText(
            learningContentPresentation({
                status: 'unsupported',
                limitationCode: result.code,
                brief,
                preferences: input.preferences,
                message: input.message.content,
                ...(resolution.replyLanguage
                    ? { replyLanguage: resolution.replyLanguage }
                    : {}),
            }),
            'limitation',
        );
    }

    if (result.status !== 'ready') {
        throw new Error(
            'The requested interactive learning content could not be generated. Retry the request.',
        );
    }

    signal.throwIfAborted();
    if (
        !input.canProposeBlocks ||
        input.readOnlySource ||
        !input.onBlockProposal
    ) {
        throw new Error('This source cannot propose learning content.');
    }

    const proposal = result.proposal;
    const callId = randomUUID();
    await input.onTool?.({
        id: callId,
        name: 'propose_learning_blocks',
        state: 'running',
    });

    try {
        const persisted = await input.onBlockProposal(proposal);
        signal.throwIfAborted();
        state.pending = null;
        const canonical = input.readBlockProposal
            ? await input.readBlockProposal(persisted.id)
            : { id: persisted.id, blocks: result.proposal.blocks };
        const ordinal =
            Math.max(0, ...state.proposals.map((item) => item.ordinal ?? 0)) +
            1;

        state.proposals = [
            ...state.proposals,
            describeLearningProposal(
                canonical.id,
                canonical.blocks,
                brief.tasks
                    .map((task) => `${task.kind}: ${task.instruction}`)
                    .join('; ')
                    .slice(0, 2_000),
                ordinal,
            ),
        ].slice(-8);

        await saveState();
        await input.onTool?.({
            id: callId,
            name: 'propose_learning_blocks',
            state: 'succeeded',
        });

        return finishText(
            learningContentPresentation({
                status: 'ready',
                brief,
                preferences: input.preferences,
                message: input.message.content,
                appliedDefaults: normalized.appliedDefaults,
                ...(resolution.replyLanguage
                    ? { replyLanguage: resolution.replyLanguage }
                    : {}),
            }),
            'generation',
        );
    } catch (error) {
        await input.onTool?.({
            id: callId,
            name: 'propose_learning_blocks',
            state: 'failed',
        });

        throw error;
    }
}
