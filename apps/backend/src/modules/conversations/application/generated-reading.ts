import {
    LearningBlockSchema,
    type KnowledgeNode,
    type KnowledgeBody,
    type LessonPart,
} from '@languon/contracts';
import type { GeneratedReading } from './ports/tutor-runner';

function nodeText(node: KnowledgeNode): string {
    if (node.type === 'text') {
        return node.text ?? '';
    }

    if (node.type === 'hardBreak') {
        return '\n';
    }

    return (node.content ?? []).map(nodeText).join('');
}

function readingTitle(value: string) {
    const title = value.trim().replace(/\s+/gu, ' ');
    if (title.length <= 110) {
        return title;
    }

    const prefix = title.slice(0, 109);
    const boundary = prefix.lastIndexOf(' ');

    return `${prefix.slice(0, boundary > 70 ? boundary : prefix.length)}…`;
}

/** Preserve published task boundaries even when a lesson contains several readings with multiple headings. */
export function readingFromPart(
    proposalId: string,
    part: Pick<LessonPart, 'kind' | 'taskId' | 'startIndex' | 'nodeCount'>,
    nodes: KnowledgeNode[],
): GeneratedReading | undefined {
    const key = `${proposalId}/${part.taskId}`;
    const content = nodes.slice(
        part.startIndex,
        part.startIndex + part.nodeCount,
    );

    if (part.kind === 'prose') {
        const paragraphs = content.map(nodeText).filter(Boolean);
        const text = paragraphs.join('\n');
        if (text.trim()) {
            return {
                key,
                title: readingTitle(
                    paragraphs.find((paragraph) => paragraph.trim()) ?? text,
                ),
                text,
            };
        }
    }

    if (part.kind === 'bilingual-text') {
        const block = LearningBlockSchema.safeParse(content[0]?.attrs?.block);
        if (block.success && block.data.type === 'bilingual-text') {
            const text = block.data.segments
                .map((segment) => segment.text)
                .join('\n');

            if (text.trim()) {
                return {
                    key,
                    title: readingTitle(block.data.title || text),
                    text,
                };
            }
        }
    }

    return undefined;
}

/** A standalone proposal has one prose body, or individually addressable learning blocks. */
export function standaloneProposalReadings(
    id: string,
    body: KnowledgeBody,
): GeneratedReading[] {
    const nodes = body.document.content ?? [];
    if (!nodes.some((node) => node.type === 'learningBlock')) {
        const reading = readingFromPart(
            id,
            {
                kind: 'prose',
                taskId: 'prose',
                startIndex: 0,
                nodeCount: nodes.length,
            },
            nodes,
        );

        return reading ? [reading] : [];
    }

    return nodes.flatMap((node, index) => {
        const block = LearningBlockSchema.safeParse(node.attrs?.block);
        if (!block.success || block.data.type !== 'bilingual-text') {
            return [];
        }

        const reading = readingFromPart(
            id,
            {
                kind: 'bilingual-text',
                taskId: block.data.id,
                startIndex: index,
                nodeCount: 1,
            },
            nodes,
        );

        return reading ? [reading] : [];
    });
}
