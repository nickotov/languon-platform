import { TextAiRoutingConflictError } from '../../../text-ai/domain/text-ai-routing';
import { TextAiPreferenceConflictError } from '../../../text-ai/domain/text-ai-preference-store';
import { ModelPriceConflictError } from '../../../ai-credits/infrastructure/persistence/drizzle/drizzle-model-price-participant';
import { CapabilityPolicyConflictError } from '../../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { AccountingConflictError } from '../../../ai-credits/domain/accounting';
import { AiCreditManagementConflictError } from '../../../ai-credits/domain/ai-credit';
import { AdminMcpError } from '../../domain/admin-mcp';

/** Keep safe recovery instructions consistent across each established store. */
export function rethrowOperationConflict(error: unknown): never {
    if (
        error instanceof TextAiRoutingConflictError ||
        error instanceof TextAiPreferenceConflictError ||
        error instanceof ModelPriceConflictError ||
        error instanceof CapabilityPolicyConflictError ||
        error instanceof AccountingConflictError ||
        error instanceof AiCreditManagementConflictError
    ) {
        throw new AdminMcpError(
            'stale_preview',
            'The target changed after this preview. Read its current state and create a new preview.',
        );
    }

    throw error;
}
