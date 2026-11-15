import { createHash } from 'node:crypto';
import type { SubmitConversationTurnRequest } from '@languon/contracts';

/** Confirmation identity is transport-only; all semantic input participates in replay identity. */
export function conversationRequestFingerprint(
    input: SubmitConversationTurnRequest,
) {
    return createHash('sha256')
        .update(JSON.stringify({ ...input, confirmedQuoteId: undefined }))
        .digest('hex');
}
