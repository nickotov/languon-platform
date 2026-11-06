import type { PreparedTutorHistory } from '../../application/ports/tutor-runner';
import {
    createLearningContentOperations,
    type LearningContentReceipt,
} from './learning-content-operations';
import { executeLearningBlockOperation } from './learning-block-operations';
import { learningProposalReadyPresentation } from '../../application/learning-content-presentation';
import type { LearningContentExecutionBudget } from '../../application/learning-content-batches';
import { serializeLearningContentBrief } from '../../application/learning-content-transport';
import {
    frozenTutorTextSources,
    mergePendingLearningContentBrief,
    groundLearningContentBrief,
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
import {
    learningContentCapabilities,
    type LearningContentBrief,
} from '../../application/learning-content-contract';
import {
    TutorRequestResolutionSchema,
    tutorRequestStateKey,
} from '../../application/tutor-request-contract';
import {
    buildTutorPlannerPrompt,
    readTutorPlannerState,
} from '../../application/tutor-planner-prompt';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import { createLearningContentAuthoring } from './learning-content-authoring';
import {
    generateTutorObject,
    type createTutorRequestAgents,
} from './tutor-request-agents';

type RequestAgents = ReturnType<typeof createTutorRequestAgents>;

/** Only a previously host-grounded pending brief may retain descriptor source text. */
function sanitizeSourcePatch(
    brief: LearningContentBrief,
    pending: LearningContentBrief | null,
): LearningContentBrief {
    return {
        tasks: brief.tasks.map((task) => {
            const previous = pending?.tasks.find((item) => item.id === task.id);
            if (!task.source && !previous?.source) {
                return task;
            }

            const { sourceText: _untrustedText, ...requirements } = task;

            return requirements;
        }),
    };
}

/** Returns null for ordinary streamed prose; all other paths complete without actor tool selection. */
export async function executeTutorRequest(
    input: TutorRunInput,
    agents: RequestAgents,
    signal: AbortSignal,
    readBudget: (() => LearningContentExecutionBudget) | undefined,
    history: PreparedTutorHistory,
) {
    const stored = await input.memory.readState(tutorRequestStateKey);
    const state = readTutorPlannerState(stored);
    const loaded = await loadLearningProposalCatalog(input, state);
    state.proposals = loaded.catalog;
    const frozenSources = frozenTutorTextSources(input);
    const resolution = TutorRequestResolutionSchema.parse(
        await generateTutorObject({
            agent: agents.tutorRequestResolver,
            prompt: buildTutorPlannerPrompt(input, state, history),
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

    async function rememberReceipt(
        receipt: LearningContentReceipt,
        summary: string,
    ) {
        const ordinal =
            Math.max(0, ...state.proposals.map((item) => item.ordinal ?? 0)) +
            1;
        const canonical = input.readBlockProposal
            ? await input.readBlockProposal(receipt.proposalId)
            : undefined;
        const descriptor = canonical
            ? describeLearningProposal(
                  canonical.id,
                  canonical.blocks,
                  summary,
                  ordinal,
              )
            : {
                  id: receipt.proposalId,
                  summary,
                  ordinal,
                  kinds: [...new Set(receipt.content.map((item) => item.kind))],
                  titles: receipt.content
                      .flatMap((item) => (item.title ? [item.title] : []))
                      .slice(0, 8),
              };

        state.proposals = [...state.proposals, descriptor].slice(-8);
    }

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
        resolution.kind === 'copy' ||
        resolution.kind === 'revise-blocks' ||
        resolution.kind === 'revise'
    ) {
        const receipts = await executeLearningBlockOperation({
            input,
            resolution,
            agents,
            signal,
            readBudget,
        });

        state.pending = null;
        for (const receipt of receipts) {
            await rememberReceipt(receipt, receipt.summary);
        }

        await saveState();

        return finishText(
            learningProposalReadyPresentation({
                preferences: input.preferences,
                message: input.message.content,
                replyLanguage: resolution.replyLanguage,
            }),
            'revision',
        );
    }

    if (resolution.kind === 'clarify') {
        const extracted = sanitizeSourcePatch(
            resolution.brief,
            resolution.continuesPending ? state.pending : null,
        );
        const pending = resolution.continuesPending
            ? mergePendingLearningContentBrief(state.pending, extracted)
            : extracted;

        try {
            state.pending = groundLearningContentBrief(
                pending,
                frozenSources,
                loaded.blocks,
            );
        } catch {
            // Unavailable sources stay unresolved rather than storing model-invented text.
            state.pending = pending;
        }

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

    const extractedBrief = sanitizeSourcePatch(
        resolution.brief,
        resolution.continuesPending ? state.pending : null,
    );
    const requestedBrief = resolution.continuesPending
        ? mergePendingLearningContentBrief(state.pending, extractedBrief)
        : extractedBrief;
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
        ...(readBudget ? { readBudget } : {}),
        generate: ({
            prompt,
            schema,
            signal: authoringSignal,
            maxOutputTokens,
        }) =>
            generateTutorObject({
                agent: agents.learningContentAuthor,
                prompt: `${prompt}\nApplication authoring preferences (trusted server-validated settings): ${JSON.stringify(authorPreferences)}\nUse explanationLanguage for explanatory prose fields such as grammar rules, commentary and exercise explanations, applying detail, wording and approach independently. Keep every task's studied language and translation language unchanged. Preserve verbatim source passages, vocabulary terms, grammatical patterns, questions and prepared answers in their designated task languages.`,
                schema,
                signal: authoringSignal,
                operationId: `${input.operationId}:authoring`,
                maxOutputTokens,
            }),
    });

    if (
        !input.canProposeBlocks ||
        input.readOnlySource ||
        !input.onBlockProposal
    ) {
        throw new Error('This source cannot propose learning content.');
    }

    const operations = createLearningContentOperations({
        authoring,
        signal,
        publish: input.onBlockProposal,
        resolveSources: async () => normalized.brief,
        ...(input.onTool ? { onTool: input.onTool } : {}),
    });
    const result = await operations.generateAndPropose(normalized.brief);
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
    state.pending = null;
    const receipt = result.receipt;
    const summary = brief.tasks
        .map((task) => `${task.kind}: ${task.instruction}`)
        .join('; ')
        .slice(0, 2_000);

    await rememberReceipt(receipt, summary);
    await saveState();

    return finishText(
        learningContentPresentation({
            status: 'ready',
            brief,
            preferences: input.preferences,
            message: input.message.content,
            appliedDefaults: normalized.appliedDefaults,
            replyLanguage: resolution.replyLanguage,
        }),
        'generation',
    );
}
