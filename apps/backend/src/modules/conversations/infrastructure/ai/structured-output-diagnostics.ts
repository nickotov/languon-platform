import { z } from 'zod';
import { GenerationFailurePathSchema } from '@languon/contracts';
import type { GenerationFailureDiagnostic } from '../../application/generation-failure';

/** Mastra exposes a v2 model interface but forwards v3/v4 terminal frames
 * from the resolved adapter. Only the unified category is safe to persist.
 */
export function structuredFinishReason(reason: unknown) {
    const unified =
        reason && typeof reason === 'object' && 'unified' in reason
            ? reason.unified
            : reason;

    switch (unified) {
        case 'length':
        case 'stop':
        case 'tool-calls':
        case 'content-filter':
        case 'error':
        case 'other':
            return unified;
        default:
            return 'unknown' as const;
    }
}

export type StructuredFinishReason = ReturnType<typeof structuredFinishReason>;

const invariantCodes = new Map<
    string,
    NonNullable<GenerationFailureDiagnostic['invariant']>
>([
    ['Exercise questions must not repeat.', 'distinct-question'],
    ['Vocabulary entries must not repeat.', 'distinct-term'],
    ['Exercises must cover every supplied word.', 'requested-words'],
    [
        'Every requested exercise must be present as an exercise block.',
        'required-block-count',
    ],
    [
        'Exercises must preserve the exact named activity allocation, order, format and languages.',
        'activity-allocation',
    ],
    ['Rubric must cover evidence.', 'passage-evidence'],
    ['Rubric must cover target-use.', 'target-language-use'],
    [
        'Choice answers must be distinct after NFC and whitespace normalization.',
        'distinct-choice',
    ],
    [
        'Prepared gap keys must cover the actual gaps and accepted variants exactly.',
        'checking-key',
    ],
    ['Source does not meet this activity prerequisite.', 'source-prerequisite'],
]);

// Only exact host-authored invariants are mapped. Never forward an arbitrary
// Error.message: SDK and schema errors can embed generated learner content.
const contentFailurePaths = new Map<string, string[]>([
    ['Generated language does not match the brief.', ['language']],
    ['All requested tasks must appear exactly once.', ['tasks']],
    ['Generated identities must be unique.', ['blocks.id']],
    [
        'New content must not replace authorized source identities.',
        ['blocks.id'],
    ],
    [
        'Prepared choice key must cover exactly the actual choices.',
        ['semantics.checking.key', 'choices'],
    ],
    [
        'Reference answer must name the correct choice.',
        ['referenceAnswer', 'correctChoiceId'],
    ],
    [
        'Choice answers must be distinct after NFC and whitespace normalization.',
        ['choices'],
    ],
    [
        'Prepared gap keys must cover the actual gaps and accepted variants exactly.',
        ['semantics.checking.key.gaps', 'parts'],
    ],
    [
        'Prepared text variants must match the exercise and include its reference answer.',
        ['semantics.checking.key', 'acceptedAnswers', 'referenceAnswer'],
    ],
]);

/** Schema paths are projected through known field names; issue messages may echo data. */
export function schemaFailureDiagnostic(
    error: unknown,
): GenerationFailureDiagnostic {
    if (!(error instanceof z.ZodError)) {
        const paths =
            error instanceof Error
                ? contentFailurePaths.get(error.message)
                : undefined;

        const invariant =
            error instanceof Error
                ? invariantCodes.get(error.message)
                : undefined;

        return {
            code: 'content-invalid',
            ...(invariant ? { invariant } : {}),
            ...(paths ? { paths } : {}),
        };
    }

    const paths = [
        ...new Set(
            error.issues.slice(0, 8).map((issue) =>
                issue.path
                    .flatMap((part) =>
                        typeof part === 'number'
                            ? Number.isInteger(part) && part >= 0 && part <= 999
                                ? [String(part)]
                                : []
                            : typeof part === 'string' &&
                                !part.includes('.') &&
                                GenerationFailurePathSchema.safeParse(part)
                                    .success
                              ? [String(part)]
                              : [],
                    )
                    .slice(0, 8)
                    .join('.'),
            ),
        ),
    ].filter(Boolean);

    const invariant = error.issues
        .map((issue) => invariantCodes.get(issue.message))
        .find(Boolean);

    return {
        code: 'schema-invalid',
        ...(invariant ? { invariant } : {}),
        ...(paths.length ? { paths } : {}),
    };
}

/** Only known structured-output errors establish a completed invalid response. */
export function completedStructuredFailure(
    error: unknown,
): GenerationFailureDiagnostic | undefined {
    const visited = new Set<unknown>();
    let current = error;
    let structured = false;
    let finishReason: StructuredFinishReason | undefined;
    let diagnostic: GenerationFailureDiagnostic | undefined;

    for (
        let depth = 0;
        depth < 6 &&
        current &&
        typeof current === 'object' &&
        !visited.has(current);
        depth += 1
    ) {
        visited.add(current);
        const value = current as {
            name?: unknown;
            finishReason?: unknown;
            cause?: unknown;
        };

        if (value.finishReason !== undefined) {
            const reason = structuredFinishReason(value.finishReason);
            // SDK exceptions may wrap a refusal from an outer processing step.
            if (reason === 'content-filter' || reason === 'error') {
                return { code: 'provider-rejected', finishReason: reason };
            }

            finishReason ??= reason;
        }

        if (finishReason === 'length') {
            diagnostic = { code: 'output-limit' };
        }

        if (current instanceof z.ZodError) {
            structured = true;
            diagnostic ??= schemaFailureDiagnostic(current);
        }

        if (
            value.name === 'AI_NoObjectGeneratedError' ||
            value.name === 'AI_TypeValidationError'
        ) {
            structured = true;
        }

        current = value.cause;
    }

    if (!structured) {
        return undefined;
    }

    return {
        ...(diagnostic ?? { code: 'schema-invalid' }),
        ...(finishReason ? { finishReason } : {}),
    };
}
