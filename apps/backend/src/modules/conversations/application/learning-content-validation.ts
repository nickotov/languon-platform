import { learningContentProseText } from './learning-content-prose';
import {
    LearningContentProposalInputSchema,
    LearningBlockSchema,
    ProseKnowledgeBodySchema,
    type KnowledgeBody,
    type LearningBlock,
    type LearningContentProposalInput,
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
    reservedIdentities: readonly LearningBlock[],
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
            if (key !== 'group' && key !== 'semantics') {
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
    collectSourceIds(reservedIdentities);

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
            !['audio', 'video'].includes(
                sources.get(block.group.parentBlockId)?.type ?? '',
            )
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
    tasks: {
        taskId: string;
        blocks: LearningBlock[];
        prose?: KnowledgeBody | undefined;
    }[],
    authorizedSources: readonly LearningBlock[] = [],
    reservedIdentities: readonly LearningBlock[] = [],
): LearningContentProposalInput {
    if (
        tasks.length !== brief.tasks.length ||
        new Set(tasks.map((task) => task.taskId)).size !== tasks.length
    ) {
        throw new Error('All requested tasks must appear exactly once.');
    }

    const ordered = brief.outputOrder ?? brief.tasks.map((task) => task.id);
    if (
        new Set(ordered).size !== brief.tasks.length ||
        ordered.some((id) => !brief.tasks.some((task) => task.id === id))
    ) {
        throw new Error('Output order must include every task exactly once.');
    }

    const blocks: LearningBlock[] = [];
    const content = ordered.flatMap(
        (taskId): KnowledgeBody['document']['content'] => {
            const task = brief.tasks.find((item) => item.id === taskId)!;
            const result = tasks.find(
                (candidate) => candidate.taskId === task.id,
            );

            if (!result) {
                throw new Error('A requested task is missing.');
            }

            if (task.kind === 'prose') {
                if (result.blocks.length) {
                    throw new Error('Prose must not include custom blocks.');
                }

                const prose = ProseKnowledgeBodySchema.parse(result.prose);
                if (!learningContentProseText(prose).trim()) {
                    throw new Error('Generated prose is empty.');
                }

                return prose.document.content;
            }

            if (result.prose) {
                throw new Error('Custom block tasks must not contain prose.');
            }

            const parsed = result.blocks.map((block) =>
                LearningBlockSchema.parse(block),
            );

            validateTask(task, parsed);
            blocks.push(...parsed);

            return parsed.map((block) => ({
                type: 'learningBlock' as const,
                attrs: { block },
            }));
        },
    );

    validateReferences(blocks, authorizedSources, reservedIdentities);

    return LearningContentProposalInputSchema.parse({
        body: { schemaVersion: 2, document: { type: 'doc', content } },
    });
}
