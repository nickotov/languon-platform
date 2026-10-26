import { z } from 'zod';
import type { TextAiProviderCredentials } from '../modules/text-ai/application/text-ai-provider-catalog';
import {
    parseEnvironmentSchema,
    type EnvironmentDiagnostics,
} from './environment-diagnostics';

const optionalCredential = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().trim().min(1).optional(),
);

export const textAiProviderEnvironmentShape = {
    DEEPSEEK_API_KEY: optionalCredential,
    KIE_API_KEY: optionalCredential,
    EVOLINK_API_KEY: optionalCredential,
    OPENROUTER_API_KEY: optionalCredential,
};

/** Optional keys are quiet; route activation separately requires its credential. */
export function loadTextAiProviderCredentials(
    values: NodeJS.ProcessEnv = process.env,
    diagnostics: EnvironmentDiagnostics = console,
): TextAiProviderCredentials {
    const parsed = parseEnvironmentSchema(
        z.object(textAiProviderEnvironmentShape),
        values,
        diagnostics,
    );
    return Object.fromEntries(
        Object.entries(parsed).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
        ),
    );
}
