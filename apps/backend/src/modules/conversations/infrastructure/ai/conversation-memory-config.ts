import { z } from 'zod';

const positiveInteger = z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER);
const threshold = z.union([
    positiveInteger,
    z
        .object({ min: positiveInteger, max: positiveInteger })
        .refine((value) => value.min <= value.max),
]);
const observationOverrides = z.object({ messageTokens: threshold.optional() });
const reflectionOverrides = z.object({
    observationTokens: threshold.optional(),
});
const persistedConfig = z.object({
    scope: z.literal('thread').optional(),
    shareTokenBudget: z.boolean().optional(),
    observation: observationOverrides
        .extend({
            maxTokensPerBatch: positiveInteger.optional(),
            previousObserverTokens: z
                .union([
                    z.literal(false),
                    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
                ])
                .optional(),
        })
        .optional(),
    reflection: reflectionOverrides.optional(),
    _overrides: z
        .object({
            observation: observationOverrides.optional(),
            reflection: reflectionOverrides.optional(),
        })
        .optional(),
});

/**
 * SDK configs contain live model instances with credentials and transport settings.
 * Persist only the explicit data needed to reconstruct numeric memory thresholds;
 * models, prompts, headers, provider options and executable objects stay in process.
 * Zod strips unknown keys before any serialization, including nested SDK objects.
 */
export function projectTutorMemoryConfig(
    value: unknown,
): Record<string, unknown> {
    return persistedConfig.parse(value ?? {});
}

/** Deep-merge only already projected scalar config, never live SDK instances. */
export function mergeTutorMemoryConfig(
    current: unknown,
    update: unknown,
): Record<string, unknown> {
    const left = persistedConfig.parse(current ?? {});
    const right = persistedConfig.parse(update ?? {});

    return projectTutorMemoryConfig({
        ...left,
        ...right,
        ...(left.observation || right.observation
            ? {
                  observation: { ...left.observation, ...right.observation },
              }
            : {}),
        ...(left.reflection || right.reflection
            ? {
                  reflection: { ...left.reflection, ...right.reflection },
              }
            : {}),
        ...(left._overrides || right._overrides
            ? {
                  _overrides: {
                      ...(left._overrides?.observation ||
                      right._overrides?.observation
                          ? {
                                observation: {
                                    ...left._overrides?.observation,
                                    ...right._overrides?.observation,
                                },
                            }
                          : {}),
                      ...(left._overrides?.reflection ||
                      right._overrides?.reflection
                          ? {
                                reflection: {
                                    ...left._overrides?.reflection,
                                    ...right._overrides?.reflection,
                                },
                            }
                          : {}),
                  },
              }
            : {}),
    });
}
