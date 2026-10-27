import { describe, expect, it } from 'vitest';
import { rethrowOperationConflict } from '../../../../src/modules/admin-mcp/infrastructure/operations/operation-conflicts';
import { TextAiRoutingConflictError } from '../../../../src/modules/text-ai/domain/text-ai-routing';
import { TextAiPreferenceConflictError } from '../../../../src/modules/text-ai/domain/text-ai-preference-store';
import { ModelPriceConflictError } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-model-price-participant';
import { CapabilityPolicyConflictError } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { AccountingConflictError } from '../../../../src/modules/ai-credits/domain/accounting';
import { AiCreditManagementConflictError } from '../../../../src/modules/ai-credits/domain/ai-credit';
import { TextAiProbeUnavailableError } from '../../../../src/modules/text-ai/application/ports/text-ai-probe-store';

describe('MCP optimistic conflict recovery', () => {
    it('returns an explicit check prerequisite without implicitly dispatching work', () => {
        try {
            rethrowOperationConflict(
                new TextAiProbeUnavailableError('probe_check_required'),
            );
        } catch (error) {
            expect(error).toMatchObject({
                code: 'check_required',
                message: expect.stringContaining(
                    'Checks never run automatically',
                ),
            });
            return;
        }
        throw new Error('Expected a check prerequisite');
    });
    it.each([
        TextAiRoutingConflictError,
        TextAiPreferenceConflictError,
        ModelPriceConflictError,
        CapabilityPolicyConflictError,
        AccountingConflictError,
        AiCreditManagementConflictError,
    ])('gives actionable stale-preview recovery for %s', (Conflict) => {
        try {
            rethrowOperationConflict(
                new Conflict('Private persistence diagnostic'),
            );
        } catch (error) {
            expect(error).toMatchObject({
                code: 'stale_preview',
                message: expect.stringContaining('create a new preview'),
            });
            expect((error as Error).message).not.toContain('Private');
            return;
        }
        throw new Error('Expected a mapped conflict');
    });
    it('preserves non-conflict errors for the transport error policy', () => {
        const failure = new Error('Database unavailable');
        expect(() => rethrowOperationConflict(failure)).toThrow(failure);
    });
});
