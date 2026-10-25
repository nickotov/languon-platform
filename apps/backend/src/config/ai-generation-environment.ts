import { z } from 'zod';

/** Shared defaults; runtime factories never read process.env themselves. */
export const defaultAiGenerationTimeoutMs = 180_000;

const timeoutSchema = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce
        .number()
        .int()
        .min(1_000)
        .max(180_000)
        .default(defaultAiGenerationTimeoutMs),
);

export const aiGenerationEnvironmentShape = {
    SENTENCE_AI_TIMEOUT_MS: timeoutSchema,
    TEXT_AI_TIMEOUT_MS: timeoutSchema,
};
