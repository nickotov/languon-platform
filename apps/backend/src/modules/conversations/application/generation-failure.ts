import type { GenerationFailure } from '@languon/contracts';
import { ConversationError } from '../domain/conversation';

/** Safe operational evidence only: never include provider messages or values. */
export type GenerationFailureDiagnostic = GenerationFailure;

export const uncertainGenerationFailureCode =
    'generation_provider_outcome_unknown';

export class GenerationExecutionFailure extends ConversationError {
    constructor(readonly generationFailure: GenerationFailureDiagnostic) {
        super(
            generationFailure.code === 'unknown'
                ? 'generation_failed'
                : generationFailure.code === 'provider-outcome-unknown'
                  ? uncertainGenerationFailureCode
                  : generationFailure.code === 'output-limit'
                    ? 'generation_output_limit'
                    : generationFailure.code === 'transport' ||
                        generationFailure.code === 'rate-limited' ||
                        generationFailure.code === 'provider-rejected'
                      ? 'generation_transport_failure'
                      : generationFailure.code === 'publication'
                        ? 'generation_publication_failed'
                        : 'generation_invalid_output',
            'The current generation stage could not complete. Validated progress is saved.',
        );
    }
}
