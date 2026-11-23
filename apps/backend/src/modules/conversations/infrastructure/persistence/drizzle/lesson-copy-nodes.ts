import { createHash, randomUUID } from 'node:crypto';
import type {
    KnowledgeBody,
    KnowledgeNode,
    LearningBlock,
    LessonPart,
} from '@languon/contracts';
import { ConversationError } from '../../../domain/conversation';
import { proposalBlocks } from './content-proposal-view';
import {
    freshProposalBlocks,
    blockContentHash,
} from './block-proposal-content';

function childIdentity(blockId: string, id: string) {
    const hex = createHash('sha256')
        .update(blockId + '/' + id)
        .digest('hex');

    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        '8' + hex.slice(13, 16),
        'a' + hex.slice(17, 20),
        hex.slice(20, 32),
    ].join('-');
}

/** A new block UUID isolates learner attempts. Deriving its child UUIDs from that
 * block lets a later exercise resolve precisely the same segments and entries. */
function sourceCopy(source: LearningBlock, instanceId: string) {
    const ids = new Map([[source.id, instanceId]]);
    const [copy] = freshProposalBlocks([source], ids, (id) =>
        childIdentity(instanceId, id),
    );

    return { block: copy!, ids };
}

function references(block: LearningBlock) {
    if (block.type !== 'exercise') {
        return [];
    }

    return [
        block.group?.parentBlockId,
        block.source?.blockId,
        ...(block.semantics?.sources.flatMap((source) =>
            source.kind !== 'text-selection' && source.origin.kind === 'block'
                ? [source.origin.blockId]
                : [],
        ) ?? []),
    ];
}

export function lessonCopyNodes(
    proposal: {
        id: string;
        body: KnowledgeBody;
        dependencySnapshots: LearningBlock[];
    },
    parts: LessonPart[],
    current: KnowledgeNode,
    taskId?: string,
): KnowledgeNode[] {
    if (taskId && !parts.some((part) => part.taskId === taskId)) {
        throw new ConversationError(
            'invalid_request',
            'The selected lesson material is unavailable.',
        );
    }

    const nodes = proposal.body.document.content ?? [];
    const origins = new Map<string, string>();
    const selected: KnowledgeNode[] = [];
    for (const part of parts) {
        const marker = proposal.id + '/' + part.taskId;
        for (const node of nodes.slice(
            part.startIndex,
            part.startIndex + part.nodeCount,
        )) {
            const canonical = node.attrs?.block;
            if (canonical) {
                origins.set(canonical.id, marker);
            }

            if (!part.present && (!taskId || part.taskId === taskId)) {
                selected.push({
                    ...node,
                    attrs: {
                        ...node.attrs,
                        lessonPartId: marker,
                        ...(canonical ? { lessonBlockId: canonical.id } : {}),
                    },
                });
            }
        }
    }

    const blocks = selected.flatMap((node) => node.attrs?.block ?? []);
    const selectedIds = new Set(blocks.map((block) => block.id));
    const sources = new Map(
        [...proposal.dependencySnapshots, ...proposalBlocks(proposal.body)].map(
            (block) => [block.id, block],
        ),
    );
    const live = (current.content ?? []).flatMap((node) =>
        node.attrs?.block ? [node.attrs] : [],
    );
    const ids = new Map<string, string>();
    const supporting: KnowledgeNode[] = [];
    const prepareSource = (source: LearningBlock, support: boolean) => {
        // Exact original sources remain usable with their original member IDs.
        const original =
            support &&
            live.find(
                (attrs) =>
                    attrs.block!.id === source.id &&
                    blockContentHash(attrs.block!) === blockContentHash(source),
            );

        if (original) {
            return;
        }

        if (support) {
            for (const attrs of live) {
                if (attrs.lessonBlockId !== source.id) {
                    continue;
                }

                const saved = sourceCopy(source, attrs.block!.id);
                if (
                    blockContentHash(saved.block) ===
                    blockContentHash(attrs.block!)
                ) {
                    for (const [key, value] of saved.ids) {
                        ids.set(key, value);
                    }

                    return;
                }
            }
        }

        const saved = sourceCopy(source, randomUUID());
        for (const [key, value] of saved.ids) {
            ids.set(key, value);
        }

        if (support) {
            const owner = origins.get(source.id);
            supporting.push({
                type: 'learningBlock',
                attrs: {
                    block: saved.block,
                    lessonBlockId: source.id,
                    ...(owner ? { lessonPartId: owner } : {}),
                },
            });
        }
    };

    for (const block of blocks) {
        if (block.type !== 'exercise') {
            prepareSource(block, false);
        }
    }

    for (const id of new Set(blocks.flatMap(references))) {
        if (!id || selectedIds.has(id)) {
            continue;
        }

        const source = sources.get(id);
        if (!source || source.type === 'exercise') {
            throw new ConversationError(
                'invalid_request',
                'The lesson source is unavailable.',
            );
        }

        prepareSource(source, true);
    }

    const copies = freshProposalBlocks(blocks, ids);
    let index = 0;

    return [
        ...supporting,
        ...selected.map((node) =>
            node.type === 'learningBlock'
                ? { ...node, attrs: { ...node.attrs, block: copies[index++]! } }
                : node,
        ),
    ];
}
