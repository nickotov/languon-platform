import { Buffer } from 'node:buffer';
import { SENTENCE_LIMITS } from '@languon/contracts';
import { getLocalPrompt } from '@languon/prompts';
import { z } from 'zod';
import { SentenceGenerationDraftSchema } from '../../domain/sentence-content';
import { SentenceCheckDraftSchema } from '../../domain/sentence-feedback';
import type {
    SentenceGenerationInput,
    SentenceCheckInput,
} from '../../domain/sentence-types';

type Kind = 'generate' | 'check';
const framingReserve = 16_384;

export function sentenceGenerationProviderSchema(
    aliases: string[],
    policyVersion: 1 | 2,
) {
    const alias = z.enum(aliases as [string, ...string[]]);
    const segment = SentenceGenerationDraftSchema.shape.segments.element;
    const providerSegment =
        policyVersion === 2
            ? segment.extend({
                  contextualHint: segment.shape.contextualHint.unwrap(),
              })
            : segment.omit({ contextualHint: true });
    return SentenceGenerationDraftSchema.extend({
        segments: providerSegment
            .extend({ entryId: alias.nullable() })
            .array()
            .min(1)
            .max(SENTENCE_LIMITS.segments),
        targets: SentenceGenerationDraftSchema.shape.targets.element
            .extend({ entryId: alias })
            .array()
            .min(1)
            .max(3),
    });
}

export function sentenceCheckProviderSchema(aliases: string[]) {
    const assessment = SentenceCheckDraftSchema.shape.targets.element.omit({
        entryId: true,
    });
    const shape: Record<string, typeof assessment> = Object.fromEntries(
        aliases.map((alias) => [alias, assessment]),
    );
    const issue = SentenceCheckDraftSchema.shape.issues.element;
    return SentenceCheckDraftSchema.extend({
        targets: z.object(shape).strict(),
        issues: issue
            .omit({ span: true })
            .extend({ quote: issue.shape.span.unwrap().shape.quote.nullable() })
            .array()
            .max(SENTENCE_LIMITS.issues),
    });
}

function overhead(kind: Kind, schema: z.ZodType): number {
    return (
        Buffer.byteLength(
            getLocalPrompt(
                kind === 'generate'
                    ? 'sentence-generation-agent'
                    : 'sentence-check-agent',
            ),
            'utf8',
        ) +
        Buffer.byteLength(JSON.stringify(z.toJSONSchema(schema)), 'utf8') +
        framingReserve
    );
}

/** Same conservative byte ceiling at provider preflight and action admission. */
export function sentenceProviderInputTokens(
    kind: Kind,
    schema: z.ZodType,
    input: object,
): number {
    return (
        Buffer.byteLength(JSON.stringify(input), 'utf8') +
        overhead(kind, schema)
    );
}

/** The retained job payload conservatively includes the aliased provider input. */
export function sentenceActionInputOverhead(
    input: SentenceGenerationInput | SentenceCheckInput,
): number {
    if ('candidates' in input) {
        const aliases = input.candidates.map(
            (_, index) => `candidate-${index + 1}`,
        );
        return overhead(
            'generate',
            sentenceGenerationProviderSchema(
                aliases,
                input.generationPolicyVersion,
            ),
        );
    }
    const aliases = input.targets.map((_, index) => `target-${index + 1}`);
    return overhead('check', sentenceCheckProviderSchema(aliases));
}
