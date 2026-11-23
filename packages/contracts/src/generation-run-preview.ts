import { z } from 'zod';
import {
    KnowledgeBodySchema,
    KnowledgeContentFragmentSchema,
} from './contextual-assistant';
import { LearningBlockSchema } from './learning-blocks';

const previewPart = z
    .object({
        taskId: z
            .string()
            .min(1)
            .max(80)
            .regex(/^[A-Za-z0-9_-]+$/u),
        body: KnowledgeContentFragmentSchema,
        completedUnitCount: z.number().int().min(1).max(200),
        totalUnitCount: z.number().int().min(1).max(200),
        complete: z.boolean(),
    })
    .strict()
    .refine(
        (part) =>
            part.completedUnitCount <= part.totalUnitCount &&
            part.complete === (part.completedUnitCount === part.totalUnitCount),
        'Preview progress must describe a nonempty validated task prefix.',
    );

/** An owner-authorized read projection; it never grants insertion or source authority. */
export const GenerationRunPreviewSchema = z
    .object({
        runId: z.uuid(),
        revision: z.number().int().positive(),
        parts: z.array(previewPart).max(8),
        dependencies: z.array(LearningBlockSchema).max(25).optional(),
    })
    .strict()
    .superRefine((preview, ctx) => {
        if (
            new Set(preview.parts.map((part) => part.taskId)).size !==
            preview.parts.length
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['parts'],
                message: 'Each task may appear only once in preview order.',
            });
        }

        if (JSON.stringify(preview).length > 100_000) {
            ctx.addIssue({
                code: 'custom',
                message: 'The prepared preview exceeds its payload limit.',
            });
        }

        const generatedBlockCount = preview.parts.reduce(
            (count, part) =>
                count +
                (part.body.document.content ?? []).filter(
                    (node) => node.type === 'learningBlock',
                ).length,
            0,
        );

        if (generatedBlockCount > 25) {
            ctx.addIssue({
                code: 'custom',
                path: ['parts'],
                message:
                    'A preview may contain at most 25 generated learning blocks.',
            });
        }

        if (preview.parts.length) {
            const content = [
                ...preview.parts.flatMap(
                    (part) => part.body.document.content ?? [],
                ),
                ...(preview.dependencies ?? []).map((block) => ({
                    type: 'learningBlock',
                    attrs: { block },
                })),
            ];
            const complete = KnowledgeBodySchema.safeParse({
                schemaVersion: 2,
                document: { type: 'doc', content },
            });

            if (!complete.success) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['parts'],
                    message:
                        'Prepared parts and frozen dependencies must form a valid document.',
                });
            }
        }
    });

export type GenerationRunPreview = z.infer<typeof GenerationRunPreviewSchema>;
