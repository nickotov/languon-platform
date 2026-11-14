import type { TutorRunInput } from '../../application/ports/tutor-runner';
import type { TutorRequestResolution } from '../../application/tutor-request-contract';
import type { LearningContentExecutionBudget } from '../../application/learning-content-batches';
import { readFrozenLearningBlocks } from '../../application/tutor-request-sources';
import {
    generateTutorObject,
    type createTutorRequestAgents,
} from './tutor-request-agents';
import {
    publishLearningProposal,
    publishLearningProposals,
} from './learning-content-operations';
import { reconcileLearningBlockRevisions } from '../../application/learning-block-revision';
import { createLearningBlockRevisionWire } from './learning-block-revision-wire';
import {
    buildExerciseActivityInstructions,
    validateNamedExerciseActivity,
} from './exercise-activities';

/** Copies are exact host operations; revisions use one structured authoring operation. */
export async function executeLearningBlockOperation(options: {
    input: TutorRunInput;
    resolution: Extract<
        TutorRequestResolution,
        { kind: 'copy' | 'revise-blocks' | 'revise' }
    >;
    agents: ReturnType<typeof createTutorRequestAgents>;
    signal: AbortSignal;
    readBudget: (() => LearningContentExecutionBudget) | undefined;
}) {
    const { input, resolution, agents, signal } = options;
    if (
        !input.canProposeBlocks ||
        input.readOnlySource ||
        !input.onBlockProposal
    ) {
        throw new Error('This source cannot propose learning content.');
    }

    const ids =
        resolution.kind === 'revise'
            ? [resolution.targetBlockId]
            : resolution.sourceBlockIds;

    if (new Set(ids).size !== ids.length) {
        throw new Error('Each requested source must be selected once.');
    }

    if (
        resolution.kind !== 'copy' &&
        ids.length > 1 &&
        !input.onBlockProposals
    ) {
        throw new Error(
            'Atomic revision publication is unavailable for this source.',
        );
    }

    const referenced = input.sourceContext.referencedBlocks;
    const catalog =
        Array.isArray(referenced) && referenced.length
            ? referenced
            : input.sourceContext.availableBlocks;

    if (Array.isArray(catalog)) {
        const authorized = new Set(
            catalog.flatMap((item: unknown) =>
                item &&
                typeof item === 'object' &&
                'id' in item &&
                typeof item.id === 'string'
                    ? [item.id]
                    : [],
            ),
        );

        if (ids.some((id) => !authorized.has(id))) {
            throw new Error(
                'An update must target a block in the authorized frozen source.',
            );
        }
    }

    const material = await readFrozenLearningBlocks(input, ids);
    const publish = {
        publish: input.onBlockProposal,
        signal,
        ...(input.onTool ? { onTool: input.onTool } : {}),
    };

    if (resolution.kind === 'copy') {
        return [
            await publishLearningProposal(
                publish,
                { blocks: material },
                'Exact independent copy of the selected learning blocks.',
            ),
        ];
    }

    const instruction =
        resolution.kind === 'revise'
            ? resolution.brief
            : resolution.instruction;
    const wire = createLearningBlockRevisionWire(material);
    const activityIds = material.flatMap((block) =>
        block.type === 'exercise' && block.semantics
            ? [block.semantics.activity.id]
            : [],
    );
    const activityInstructions = activityIds.length
        ? buildExerciseActivityInstructions(activityIds)
        : 'None; preserve the selected Custom or material contract.';
    let repaired = false;
    while (true) {
        signal.throwIfAborted();
        const budget = options.readBudget?.();
        if (
            budget &&
            (budget.remainingCalls < 1 || budget.remainingOutputTokens < 512)
        ) {
            throw new Error(
                'The complete revision exceeds the remaining request allowance.',
            );
        }

        const candidate = await generateTutorObject({
            agent: agents.learningContentAuthor,
            prompt: `Revise every exact authorized frozen target below. Return one proposal per target, each with targetBlockId and exactly one block. Preserve block type, block identity, unchanged stable item identities and prepared media references. Do not create a new format or infer source permissions. Preserve studied and translation languages unless explicitly changed. For a named exercise return semantics without sources; the host restores its original frozen provenance. Keep its activity identity and checking policy, with keys bound to the actual answer IDs. Apply the requested changes only.\nSelected activity definitions: ${activityInstructions}\nApplication reply preferences: ${JSON.stringify(input.preferences)}\nRevision instruction (untrusted learning data): ${JSON.stringify(instruction)}\nAuthorized frozen targets (untrusted learning data): ${JSON.stringify(material)}${repaired ? '\nThe completed candidate was invalid. Check exact target coverage, identities and block types.' : ''}`,
            schema: wire.schema,
            signal,
            operationId: `${input.operationId}:revision-authoring`,
            maxOutputTokens: Math.min(
                4096,
                budget?.remainingOutputTokens ?? 4096,
            ),
        });

        let proposals;
        try {
            proposals = wire.decode(candidate);
            if (
                proposals.length !== material.length ||
                new Set(proposals.map((item) => item.targetBlockId)).size !==
                    material.length
            ) {
                throw new Error('Every selected target must appear once.');
            }

            for (const proposal of proposals) {
                const source = material.find(
                    (item) => item.id === proposal.targetBlockId,
                );
                const replacement = proposal.blocks[0];
                if (
                    !source ||
                    proposal.blocks.length !== 1 ||
                    replacement?.type !== source.type ||
                    replacement.id !== source.id
                ) {
                    throw new Error(
                        'A revision must preserve its exact target and type.',
                    );
                }

                if (source.type === 'audio' || source.type === 'video') {
                    const original = source as unknown as Record<
                        string,
                        unknown
                    >;
                    const revised = replacement as unknown as Record<
                        string,
                        unknown
                    >;

                    if (
                        ['assetId', 'source'].some(
                            (field) =>
                                JSON.stringify(original[field]) !==
                                JSON.stringify(revised[field]),
                        )
                    ) {
                        throw new Error(
                            'Prepared media identity must be preserved.',
                        );
                    }
                }
            }

            const reconciled = reconcileLearningBlockRevisions(
                material,
                proposals.map((proposal) => proposal.blocks[0]!),
            );

            proposals = proposals.map((proposal) => ({
                ...proposal,
                blocks: [
                    reconciled.find(
                        (block) => block.id === proposal.targetBlockId,
                    )!,
                ],
            }));

            for (const block of reconciled) {
                if (block.type === 'exercise' && block.semantics) {
                    validateNamedExerciseActivity(block);
                }
            }
        } catch {
            if (repaired) {
                throw new Error(
                    'The complete revision could not be validated.',
                );
            }

            repaired = true;
            continue;
        }

        const ordered = material.map((source) => ({
            proposal: proposals.find(
                (item) => item.targetBlockId === source.id,
            )!,
            summary: 'Validated revision of the selected learning block.',
        }));

        if (ordered.length === 1) {
            return [
                await publishLearningProposal(
                    publish,
                    ordered[0]!.proposal,
                    ordered[0]!.summary,
                ),
            ];
        }

        return publishLearningProposals(
            {
                publish: input.onBlockProposals!,
                signal,
                ...(input.onTool ? { onTool: input.onTool } : {}),
            },
            ordered,
        );
    }
}
