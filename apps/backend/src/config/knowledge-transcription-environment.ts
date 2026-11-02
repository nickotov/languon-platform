import { z } from 'zod';
import {
    parseEnvironmentSchema,
    type EnvironmentDiagnostics,
} from './environment-diagnostics';

export const knowledgeTranscriptionEnvironmentShape = {
    OPENAI_API_KEY: z.preprocess(
        (value) => (value === '' ? undefined : value),
        z
            .string()
            .min(1)
            .max(4096)
            .refine(
                (value) => !/\s/u.test(value),
                'Expected a credential without whitespace.',
            )
            .optional(),
    ),
};
/** Optional credentials remain quiet and never activate the transcription capability. */
export function loadKnowledgeTranscriptionEnvironment(
    values: NodeJS.ProcessEnv = process.env,
    diagnostics: EnvironmentDiagnostics = console,
) {
    return parseEnvironmentSchema(
        z.object(knowledgeTranscriptionEnvironmentShape),
        values,
        diagnostics,
    );
}
