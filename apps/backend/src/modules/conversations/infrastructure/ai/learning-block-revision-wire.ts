import { z } from 'zod';
import {
    AudioLearningBlockSchema,
    BilingualTextLearningBlockSchema,
    ExerciseLearningBlockSchema,
    GrammarLearningBlockSchema,
    LearningBlockSchema,
    NamedExerciseSemanticsSchema,
    NamedExerciseKeySchema,
    VideoLearningBlockSchema,
    VocabularyLearningBlockSchema,
    type LearningBlock,
} from '@languon/contracts';

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

    // Revisions edit existing choices/gaps in place and therefore retain their IDs.
    // Generation accepts content-only candidates and allocates fresh identities.
    const { sources: _sources, ...semantics } =
        NamedExerciseSemanticsSchema.shape;
    const { activity, checking } = source.semantics;
    const policySchema =
        NamedExerciseSemanticsSchema.shape.checking.options.find(
            (option) => option.shape.policy.value === checking.policy,
        )!;
    const keySchema = () => {
        if (source.format === 'fill-in-the-blank') {
            return NamedExerciseKeySchema.options[1];
        }

        if (source.format === 'free-text') {
            return NamedExerciseKeySchema.options[2];
        }

        const { classification, ...choice } =
            NamedExerciseKeySchema.options[0].shape;

        return activity.id === 'R03'
            ? z.strictObject({
                  ...choice,
                  classification: classification.unwrap(),
              })
            : z.strictObject(choice);
    };
    const fixed = {
        id: z.literal(source.id),
        semantics: z.strictObject({
            ...semantics,
            activity: z.strictObject({
                id: z.literal(activity.id),
                version: z.literal(activity.version),
            }),
            format: z.literal(source.format),
            checking:
                'key' in policySchema.shape
                    ? z.strictObject({
                          ...policySchema.shape,
                          key: keySchema(),
                      })
                    : policySchema,
        }),
    };
    const [choice, gaps, text] = ExerciseLearningBlockSchema.options;
    if (source.format === 'free-text' && checking.policy === 'ai-rubric') {
        return z
            .strictObject({ ...text.shape, ...fixed })
            .omit({ source: true, acceptedAnswers: true });
    }

    const renderer =
        source.format === 'multiple-choice'
            ? choice
            : source.format === 'fill-in-the-blank'
              ? gaps
              : text;

    return z
        .strictObject({ ...renderer.shape, ...fixed })
        .omit({ source: true });
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

                return {
                    targetBlockId: candidate.targetBlockId,
                    blocks: [
                        LearningBlockSchema.parse(
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
                        ),
                    ],
                };
            });
        },
    };
}
