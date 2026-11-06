import {
    LearningBlockProposalInputSchema,
    type LearningBlock,
    type LearningBlockProposalInput,
} from '@languon/contracts';
import type {
    LearningContentBrief,
    LearningContentTask,
} from './learning-content-contract';
import { learningContentCapability } from './learning-content-registry';

function validateTask(task: LearningContentTask, blocks: LearningBlock[]) {
    if (
        blocks.some(
            (block) => 'language' in block && block.language !== task.language,
        )
    ) {
        throw new Error('Generated language does not match the brief.');
    }

    learningContentCapability(task.kind).validate(task, blocks);
}

function validateReferences(
    blocks: LearningBlock[],
    authorizedSources: readonly LearningBlock[],
) {
    const sources = new Map(
        [...authorizedSources, ...blocks].map((block) => [block.id, block]),
    );
    const ids = new Set<string>();
    const visit = (value: unknown): void => {
        if (!value || typeof value !== 'object') {
            return;
        }

        if (
            !Array.isArray(value) &&
            'id' in value &&
            typeof value.id === 'string'
        ) {
            if (ids.has(value.id)) {
                throw new Error('Generated identities must be unique.');
            }

            ids.add(value.id);
        }

        Object.entries(value).forEach(([key, child]) => {
            if (key !== 'group') {
                visit(child);
            }
        });
    };

    visit(blocks);

    const groups = new Map<string, string>();
    for (const block of blocks) {
        if (block.type !== 'exercise' || !block.group) {
            continue;
        }

        const content = JSON.stringify(block.group);
        if (
            ids.has(block.group.id) ||
            (groups.has(block.group.id) &&
                groups.get(block.group.id) !== content)
        ) {
            throw new Error(
                'Exercise groups require distinct, consistent identities.',
            );
        }

        groups.set(block.group.id, content);
    }

    const sourceIds = new Set<string>();
    const collectSourceIds = (value: unknown): void => {
        if (!value || typeof value !== 'object') {
            return;
        }

        if ('id' in value && typeof value.id === 'string') {
            sourceIds.add(value.id);
        }

        Object.values(value).forEach(collectSourceIds);
    };

    collectSourceIds(authorizedSources);

    if ([...ids, ...groups.keys()].some((id) => sourceIds.has(id))) {
        throw new Error(
            'New content must not replace authorized source identities.',
        );
    }

    for (const block of blocks) {
        if (block.type !== 'exercise') {
            continue;
        }

        if (
            block.group?.parentBlockId &&
            !sources.has(block.group.parentBlockId)
        ) {
            throw new Error(
                'Exercise parent does not identify available content.',
            );
        }

        if (!block.source) {
            continue;
        }

        const source = sources.get(block.source.blockId);
        const segments =
            source?.type === 'bilingual-text'
                ? source.segments
                : source && (source.type === 'audio' || source.type === 'video')
                  ? source.transcript?.segments
                  : undefined;

        if (
            !segments ||
            block.source.segmentIds.some(
                (id) => !segments.some((segment) => segment.id === id),
            )
        ) {
            throw new Error(
                'Exercise references must identify authorized source passages.',
            );
        }
    }
}

/** Provider task identities are matched to the brief; provider ordering cannot reorder the proposal. */
export function validateLearningContent(
    brief: LearningContentBrief,
    tasks: { taskId: string; blocks: LearningBlock[] }[],
    authorizedSources: readonly LearningBlock[] = [],
): LearningBlockProposalInput {
    if (
        tasks.length !== brief.tasks.length ||
        new Set(tasks.map((task) => task.taskId)).size !== tasks.length
    ) {
        throw new Error('All requested tasks must appear exactly once.');
    }

    const blocks = brief.tasks.flatMap((task) => {
        const result = tasks.find((candidate) => candidate.taskId === task.id);
        if (!result) {
            throw new Error('A requested task is missing.');
        }

        const parsed = LearningBlockProposalInputSchema.parse({
            blocks: result.blocks,
        });

        validateTask(task, parsed.blocks);

        return parsed.blocks;
    });

    const proposal = LearningBlockProposalInputSchema.parse({ blocks });
    validateReferences(proposal.blocks, authorizedSources);

    return proposal;
}
