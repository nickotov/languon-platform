import type { z } from 'zod';

export interface EnvironmentDiagnostics {
    warn(message: string): void;
    error(message: string): void;
}

/** Startup-only diagnostics: report names, never supplied or default values. */
export function parseEnvironmentSchema<S extends Record<string, z.ZodType>>(
    schema: z.ZodObject<S>,
    values: NodeJS.ProcessEnv,
    diagnostics: EnvironmentDiagnostics = console,
): z.output<z.ZodObject<S>> {
    const result = schema.safeParse(values);
    if (!result.success) {
        const names = [
            ...new Set(
                result.error.issues.map((issue) =>
                    String(issue.path[0] ?? 'environment'),
                ),
            ),
        ];
        diagnostics.error(
            `Environment configuration invalid or required setting missing: ${names.join(', ')}. Startup aborted.`,
        );
        throw result.error;
    }

    const defaults: string[] = [];
    for (const [name, field] of Object.entries(schema.shape)) {
        if (values[name] !== undefined && values[name] !== '') continue;
        // Some settings intentionally accept an explicit empty string (for
        // example a disabled format list); that is not a missing default.
        if (
            values[name] === '' &&
            (result.data as Record<string, unknown>)[name] === ''
        )
            continue;
        const fallback = field.safeParse(undefined);
        if (fallback.success && fallback.data !== undefined) {
            defaults.push(name);
        }
    }
    reportEnvironmentFallbacks(values, defaults, diagnostics);
    return result.data;
}

/** For resolved conditional defaults that are intentionally outside a raw schema. */
export function reportEnvironmentFallbacks(
    values: NodeJS.ProcessEnv,
    names: readonly string[],
    diagnostics: EnvironmentDiagnostics = console,
): void {
    const missing = names.filter(
        (name) => values[name] === undefined || values[name] === '',
    );
    if (missing.length)
        diagnostics.warn(
            `Environment settings absent; using configured fallbacks: ${missing.join(', ')}.`,
        );
}
