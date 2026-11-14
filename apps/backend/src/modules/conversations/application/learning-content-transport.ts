import { z } from 'zod';
import {
    LearningContentBriefSchema,
    LearningContentTaskSchema,
    type LearningContentBrief,
} from './learning-content-contract';

interface SourceTextTask {
    sourceText?: string | undefined;
}

/** One exact passage is sent once even when several generated components use it. */
export function serializeLearningContentBrief(
    brief: {
        tasks: readonly SourceTextTask[];
    },
    externalSources?: Partial<
        Record<'editor' | 'selection', string | undefined>
    >,
): string {
    const sourceIds = new Map<string, string>();
    const sources: (
        | { id: string; text: string }
        | { id: string; source: { kind: 'editor' | 'selection' } }
    )[] = [];
    const tasks = brief.tasks.map(({ sourceText, ...task }) => {
        if (sourceText === undefined) {
            return task;
        }

        let id = sourceIds.get(sourceText);
        if (!id) {
            id = `source-${sources.length + 1}`;
            sourceIds.set(sourceText, id);
            const external = (['editor', 'selection'] as const).find(
                (kind) => externalSources?.[kind] === sourceText,
            );

            sources.push(
                external
                    ? { id, source: { kind: external } }
                    : { id, text: sourceText },
            );
        }

        return { ...task, sourceTextRef: id };
    });

    return JSON.stringify({ tasks, sources });
}

/** Decode bounded transport records or the current native application brief. */
export function deserializeLearningContentBrief(
    value: unknown,
): LearningContentBrief {
    if (!value || typeof value !== 'object' || !('sources' in value)) {
        return LearningContentBriefSchema.parse(value);
    }

    // Build lazily: the native brief's bound uses the serializer in this module.
    // No schema is accessed while the mutually dependent modules initialize.
    const sourceId = z.string().regex(/^source-[1-8]$/u);
    const compactSchema = z
        .object({
            tasks: z
                .array(
                    LearningContentTaskSchema.omit({ sourceText: true })
                        .extend({
                            sourceTextRef: sourceId.optional(),
                        })
                        .strict(),
                )
                .min(1)
                .max(8),
            sources: z
                .array(
                    z
                        .object({
                            id: sourceId,
                            text: z.string().min(1).max(40_000),
                        })
                        .strict(),
                )
                .max(8),
        })
        .strict()
        .refine(
            (candidate) => JSON.stringify(candidate).length <= 60_000,
            'The transported brief is too large.',
        );
    const compact = compactSchema.parse(value);
    const sources = new Map(
        compact.sources.map((source) => [source.id, source.text]),
    );

    if (sources.size !== compact.sources.length) {
        throw new Error('Learning source identities must be unique.');
    }

    const usedSources = new Set<string>();
    const tasks = compact.tasks.map(({ sourceTextRef, ...task }) => {
        if (!sourceTextRef) {
            return task;
        }

        const sourceText = sources.get(sourceTextRef);
        if (sourceText === undefined) {
            throw new Error('The referenced learning source is missing.');
        }

        usedSources.add(sourceTextRef);

        return { ...task, sourceText };
    });

    if (usedSources.size !== sources.size) {
        throw new Error(
            'The transported brief has unreferenced learning sources.',
        );
    }

    return LearningContentBriefSchema.parse({ tasks });
}
