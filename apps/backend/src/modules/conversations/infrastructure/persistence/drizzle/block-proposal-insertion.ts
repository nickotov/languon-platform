import {
    KnowledgeBodySchema,
    type KnowledgeNode,
    type LearningBlock,
} from '@languon/contracts';
import { ConversationError } from '../../../domain/conversation';

const invalid = () =>
    new ConversationError(
        'invalid_insertion_position',
        'The insertion cursor is unavailable or inside an atomic block or exercise group. Select a prose position and try again.',
    );

function nodeSize(node: KnowledgeNode): number {
    if (node.type === 'text') return node.text?.length ?? 0;
    if (
        node.type === 'learningBlock' ||
        node.type === 'hardBreak' ||
        node.type === 'horizontalRule'
    )
        return 1;

    return (
        2 +
        (node.content ?? []).reduce((sum, child) => sum + nodeSize(child), 0)
    );
}

function splitNode(
    node: KnowledgeNode,
    offset: number,
): [KnowledgeNode | null, KnowledgeNode | null] {
    const size = nodeSize(node);
    if (offset === 0) return [null, node];
    if (offset === size) return [node, null];
    if (
        offset < 0 ||
        offset > size ||
        node.type === 'learningBlock' ||
        node.type === 'hardBreak' ||
        node.type === 'horizontalRule'
    )
        throw invalid();
    if (node.type === 'text') {
        const text = node.text ?? '';
        const before = text.charCodeAt(offset - 1);
        const after = text.charCodeAt(offset);
        if (
            before >= 0xd800 &&
            before <= 0xdbff &&
            after >= 0xdc00 &&
            after <= 0xdfff
        )
            throw invalid();

        return [
            { ...node, text: text.slice(0, offset) },
            { ...node, text: text.slice(offset) },
        ];
    }

    const [left, right] = splitChildren(node.content ?? [], offset - 1);

    return [
        left.length ? { ...node, content: left } : null,
        right.length ? { ...node, content: right } : null,
    ];
}

function splitChildren(
    children: KnowledgeNode[],
    position: number,
): [KnowledgeNode[], KnowledgeNode[]] {
    let cursor = 0;
    for (let index = 0; index < children.length; index++) {
        const child = children[index]!;
        const end = cursor + nodeSize(child);
        if (position <= end) {
            const [left, right] = splitNode(child, position - cursor);

            return [
                [...children.slice(0, index), ...(left ? [left] : [])],
                [...(right ? [right] : []), ...children.slice(index + 1)],
            ];
        }

        cursor = end;
    }

    if (position !== cursor) throw invalid();

    return [children, []];
}

function block(node: KnowledgeNode | undefined): LearningBlock | undefined {
    return node?.type === 'learningBlock' ? node.attrs?.block : undefined;
}

function sharesGroup(
    left: LearningBlock | undefined,
    right: LearningBlock | undefined,
    mediaIds: Set<string>,
): boolean {
    if (!left || right?.type !== 'exercise') return false;
    if (
        left.type === 'exercise' &&
        left.group?.id &&
        left.group.id === right.group?.id
    )
        return true;
    const source = right.group?.parentBlockId ?? right.source?.blockId;
    if ((left.type === 'audio' || left.type === 'video') && source === left.id)
        return true;

    return (
        left.type === 'exercise' &&
        Boolean(source) &&
        mediaIds.has(source!) &&
        source === (left.group?.parentBlockId ?? left.source?.blockId)
    );
}

/** Insert independent copies at PM positions, lifting valid prose splits to the document root. */
export function insertProposalBlocks(
    document: KnowledgeNode,
    blocks: LearningBlock[],
    position: number,
): KnowledgeNode {
    if (!Number.isInteger(position) || position < 0) throw invalid();
    const children = document.content ?? [];
    const mediaIds = new Set(
        children.flatMap((node) => {
            const item = block(node);

            return item?.type === 'audio' || item?.type === 'video'
                ? [item.id]
                : [];
        }),
    );
    const [left, right] = splitChildren(children, position);
    const meaningful = (nodes: KnowledgeNode[]) =>
        nodes.filter(
            (node) => !(node.type === 'paragraph' && !node.content?.length),
        );

    if (
        sharesGroup(
            block(meaningful(left).at(-1)),
            block(meaningful(right)[0]),
            mediaIds,
        )
    )
        throw invalid();
    const result = {
        ...document,
        content: [
            ...left,
            ...blocks.map((item) => ({
                type: 'learningBlock' as const,
                attrs: { block: item },
            })),
            ...right,
        ],
    };
    const parsed = KnowledgeBodySchema.safeParse({
        schemaVersion: 2,
        document: result,
    });

    if (!parsed.success) throw invalid();

    return parsed.data.document;
}
