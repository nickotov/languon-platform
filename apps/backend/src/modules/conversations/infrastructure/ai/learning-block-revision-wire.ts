import { z } from 'zod';
import {
    AudioLearningBlockSchema,
    BilingualTextLearningBlockSchema,
    ExerciseLearningBlockSchema,
    GrammarLearningBlockSchema,
    LearningBlockProposalInputSchema,
    VideoLearningBlockSchema,
    VocabularyLearningBlockSchema,
    type LearningBlock,
} from '@languon/contracts';
import { namedExerciseAuthoringSchemaForBrief } from './exercise-authoring-context';

const renderers = {
    audio: AudioLearningBlockSchema,
    video: VideoLearningBlockSchema,
    vocabulary: VocabularyLearningBlockSchema,
    grammar: GrammarLearningBlockSchema,
    'bilingual-text': BilingualTextLearningBlockSchema,
};

function revisionBlockSchema(source: LearningBlock): z.ZodType {
    if (source.type !== 'exercise') {
        return z
            .object({
                ...renderers[source.type].shape,
                id: z.literal(source.id),
            })
            .strict();
    }

    if (!source.semantics) {
        const options = ExerciseLearningBlockSchema.options.map((option) =>
            z
                .object({ ...option.shape, id: z.literal(source.id) })
                .omit({ semantics: true })
                .strict(),
        );

        return z.union([options[0]!, options[1]!, options[2]!]);
    }

    const schema = namedExerciseAuthoringSchemaForBrief({
        tasks: [
            {
                id: 'revision',
                kind: 'exercises',
                instruction: 'Revise the selected activity.',
                activities: [
                    { activityId: source.semantics.activity.id, count: 1 },
                ],
            },
        ],
    });

    // Exactly one known activity has exactly one format, so this factory returns
    // an object. Frozen origins stay host-owned and need not be echoed by a model.
    if (!(schema instanceof z.ZodObject)) {
        throw new Error('A named revision needs one fixed activity schema.');
    }

    return schema
        .omit({ sourceBindings: true, source: true })
        .extend({ id: z.literal(source.id) })
        .strict();
}

/** Selected targets bound the provider schema; unrelated renderers/activities never enter its context. */
export function createLearningBlockRevisionWire(
    material: readonly LearningBlock[],
) {
    const proposals = material.map((source) =>
        z
            .object({
                targetBlockId: z.literal(source.id),
                blocks: z.array(revisionBlockSchema(source)).length(1),
            })
            .strict(),
    );
    const [first, second, ...remaining] = proposals;
    if (!first) {
        throw new Error('Select a revision target.');
    }

    const proposal = second ? z.union([first, second, ...remaining]) : first;
    const schema = z
        .object({ proposals: z.array(proposal).length(material.length) })
        .strict();

    return {
        schema,
        decode(value: unknown) {
            return schema.parse(value).proposals.map((candidate) => {
                const source = material.find(
                    (block) => block.id === candidate.targetBlockId,
                )!;
                const block = candidate.blocks[0] as Record<string, unknown>;

                return LearningBlockProposalInputSchema.parse({
                    ...candidate,
                    blocks: [
                        source.type === 'exercise' && source.semantics
                            ? {
                                  ...block,
                                  ...(source.source
                                      ? { source: source.source }
                                      : {}),
                                  semantics: {
                                      ...(block.semantics as Record<
                                          string,
                                          unknown
                                      >),
                                      sources: source.semantics.sources,
                                  },
                              }
                            : block,
                    ],
                });
            });
        },
    };
}
