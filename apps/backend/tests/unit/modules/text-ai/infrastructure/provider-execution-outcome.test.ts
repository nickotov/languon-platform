import { describe, expect, it } from 'vitest';
import {
    providerExecutionOutcome,
    withProviderExecutionOutcome,
    ProviderExecutionError,
} from '../../../../../src/modules/text-ai/infrastructure/ai/provider-execution-outcome';

describe('safe provider rejection evidence', () => {
    it.each([401, 402, 404, 410, 429])(
        'marks a conclusive HTTP %s rejection',
        (statusCode) => {
            expect(providerExecutionOutcome({ statusCode }, 'openrouter')).toBe(
                'rejected',
            );
        },
    );
    it.each([400, 403, 408, 500, 502, 503, undefined])(
        'does not authorize rerouting for ambiguous or policy status %s',
        (statusCode) => {
            expect(providerExecutionOutcome({ statusCode }, 'openrouter')).toBe(
                'ambiguous',
            );
        },
    );
    it('preserves safe metadata on trusted application errors without copying provider payload', () => {
        const error = withProviderExecutionOutcome(
            new Error('Safe application failure.'),
            { statusCode: 429, message: 'private' },
            'evolink',
        );
        expect(error.executionOutcome).toBe('rejected');
        expect(JSON.stringify(error)).not.toContain('private');
    });
    it('retains original SDK cause internally and leaves disconnects ambiguous', () => {
        const cause = Object.freeze({ code: 'ECONNRESET' });
        const error = new ProviderExecutionError(cause, 'openrouter');
        expect(error.cause).toBe(cause);
        expect(error.executionOutcome).toBe('ambiguous');
    });
});
