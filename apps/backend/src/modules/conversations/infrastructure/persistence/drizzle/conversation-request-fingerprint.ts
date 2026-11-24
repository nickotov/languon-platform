import type { GenerationAdmission } from '../../../application/ports/generation-run';
import { generationFingerprint } from '../../../application/generation-run-revisions';
import { createHash } from 'node:crypto';
import type { SubmitConversationTurnRequest } from '@languon/contracts';

/** Confirmation identity is transport-only; all semantic input participates in replay identity. */
export function conversationRequestFingerprint(
    input: SubmitConversationTurnRequest,
    generation?: GenerationAdmission,
) {
    if (generation) {
        return generationFingerprint({
            input: { ...input, confirmedQuoteId: undefined },
            generation,
        });
    }

    return createHash('sha256')
        .update(JSON.stringify({ ...input, confirmedQuoteId: undefined }))
        .digest('hex');
}
