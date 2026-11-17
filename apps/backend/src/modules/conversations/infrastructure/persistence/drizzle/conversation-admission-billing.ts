import type { ConversationBilling } from '@languon/contracts';
import { formatCreditMilli } from '../../../../ai-credits/domain/exact-credit-amount';

/** Admission pins the visible hold; only canonical settlement can replace it. */
export function conversationAdmissionBilling(
    execution: Record<string, unknown>,
): { billing?: ConversationBilling } {
    if (execution.actionAccountingVersion !== 1) {
        return {};
    }

    return {
        billing: {
            state: execution.funding === 'customer' ? 'held' : 'free',
            heldCredits: formatCreditMilli(
                BigInt(String(execution.heldCreditsMilli)),
            ),
            chargedCredits: null,
            measurement: null,
        },
    };
}
