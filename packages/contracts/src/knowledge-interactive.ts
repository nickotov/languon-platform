import { z } from 'zod';
import { LearningBlockSchema, type LearningBlock } from './learning-blocks';
import type { KnowledgeNode } from './contextual-assistant';

export const KnowledgeLearningBlockNodeSchema = z
    .object({
        type: z.literal('learningBlock'),
        attrs: z.object({ block: LearningBlockSchema }).strict(),
    })
    .strict();
export type KnowledgeLearningBlockNode = z.infer<
    typeof KnowledgeLearningBlockNodeSchema
>;

/** Protect recursive validation, including block metadata and translations. */
const boundedPayload = z.unknown().superRefine((value, ctx) => {
    const pending = [{ value, depth: 0 }];
    let count = 0;
    let characters = 0;
    while (pending.length) {
        const item = pending.pop()!;
        count += 1;
        if (typeof item.value === 'string') characters += item.value.length;
        if (count > 30_000 || characters > 160_000 || item.depth > 24) {
            ctx.addIssue({
                code: 'custom',
                message: 'Interactive document exceeds its payload limit.',
            });
            return;
        }
        if (item.value && typeof item.value === 'object') {
            const entries = Object.entries(item.value);
            if (entries.length + pending.length > 30_000) {
                ctx.addIssue({
                    code: 'custom',
                    message:
                        'Interactive document exceeds its structure limit.',
                });
                return;
            }
            for (const [key, child] of entries) {
                characters += key.length;
                pending.push({ value: child, depth: item.depth + 1 });
            }
        }
    }
});

const rootSchema = z
    .object({
        type: z.literal('doc'),
        content: z.array(z.unknown()).min(1).max(5_000),
    })
    .strict();

function sourceSegments(block: LearningBlock): string[] {
    if (block.type === 'bilingual-text')
        return block.segments.map((segment) => segment.id);
    if (block.type === 'audio' || block.type === 'video')
        return block.transcript?.segments.map((segment) => segment.id) ?? [];
    return [];
}

/**
 * Atomic learning blocks are top-level document children. Prose retains the
 * exact legacy topology; blocks cannot be hidden in lists, tables or quotes.
 * Factory injection avoids a runtime dependency cycle with the legacy contract.
 */
export function createInteractiveKnowledgeBodySchema(
    legacyDocument: z.ZodType<KnowledgeNode>,
) {
    const document = boundedPayload.pipe(
        z.custom<KnowledgeNode>().superRefine((value, ctx) => {
            const root = rootSchema.safeParse(value);
            if (!root.success) {
                for (const issue of root.error.issues)
                    ctx.addIssue({
                        code: 'custom',
                        path: issue.path,
                        message: issue.message,
                    });
                return;
            }
            const blocks = new Map<string, LearningBlock>();
            const prose: unknown[] = [];
            for (const [index, child] of root.data.content.entries()) {
                if (
                    child &&
                    typeof child === 'object' &&
                    'type' in child &&
                    child.type === 'learningBlock'
                ) {
                    const parsed =
                        KnowledgeLearningBlockNodeSchema.safeParse(child);
                    if (!parsed.success) {
                        for (const issue of parsed.error.issues)
                            ctx.addIssue({
                                ...issue,
                                path: ['content', index, ...issue.path],
                            });
                        continue;
                    }
                    const block = parsed.data.attrs.block;
                    if (blocks.has(block.id))
                        ctx.addIssue({
                            code: 'custom',
                            path: ['content', index],
                            message: 'Learning block IDs must be unique.',
                        });
                    blocks.set(block.id, block);
                    prose.push({ type: 'paragraph' });
                } else prose.push(child);
            }
            const proseResult = legacyDocument.safeParse({
                type: 'doc',
                content: prose,
            });
            if (!proseResult.success)
                for (const issue of proseResult.error.issues)
                    ctx.addIssue({
                        code: 'custom',
                        path: issue.path,
                        message: issue.message,
                    });
            const exerciseGroups = new Map<string, string>();
            for (const block of blocks.values()) {
                if (block.type === 'exercise' && block.group) {
                    if (
                        exerciseGroups.has(block.group.id) &&
                        exerciseGroups.get(block.group.id) !==
                            JSON.stringify({
                                title: block.group.title,
                                parentBlockId: block.group.parentBlockId,
                            })
                    )
                        ctx.addIssue({
                            code: 'custom',
                            message:
                                'Exercises in the same group must share its title and media parent.',
                        });
                    exerciseGroups.set(
                        block.group.id,
                        JSON.stringify({
                            title: block.group.title,
                            parentBlockId: block.group.parentBlockId,
                        }),
                    );
                    if (block.group.parentBlockId) {
                        const parent = blocks.get(block.group.parentBlockId);
                        if (
                            !parent ||
                            (parent.type !== 'audio' && parent.type !== 'video')
                        )
                            ctx.addIssue({
                                code: 'custom',
                                message:
                                    'Exercise group parent must reference audio or video in this document.',
                            });
                    }
                }
                if (block.type !== 'exercise' || !block.source) continue;
                const source = blocks.get(block.source.blockId);
                const ids = new Set(source ? sourceSegments(source) : []);
                if (
                    !source ||
                    block.source.segmentIds.some((id) => !ids.has(id))
                )
                    ctx.addIssue({
                        code: 'custom',
                        message:
                            'Exercise source must reference existing text or transcript segments in this document.',
                    });
            }
        }),
    );
    return z.object({ schemaVersion: z.literal(2), document }).strict();
}
