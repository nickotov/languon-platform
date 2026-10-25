import { describe, expect, it } from 'vitest';
import { cardAuthoringProviderFailure } from '../../../../../../src/modules/dictionaries/infrastructure/ai/card-authoring-provider-failure';

describe('card authoring provider failure diagnostics', () => {
    it('retains only allowlisted failure metadata and a validated job identifier', () => {
        const secret = 'private prompt and credential';
        const error = Object.assign(new Error(secret), {
            name: 'AI_APICallError',
            statusCode: 429,
            requestBodyValues: { messages: secret },
            responseBody: secret,
            headers: { authorization: secret },
            cause: Object.assign(new Error(secret), { code: 'ECONNRESET' }),
        });
        expect(
            cardAuthoringProviderFailure(
                error,
                'aa809e20-d6ab-40c9-a067-37349ab31f09/generate',
            ),
        ).toEqual({
            errorName: 'AI_APICallError',
            httpStatus: 429,
            transportCode: 'ECONNRESET',
            runId: 'aa809e20-d6ab-40c9-a067-37349ab31f09',
        });
    });

    it('drops untrusted names, codes, statuses and identifiers, and bounds cyclic causes', () => {
        const error: Record<string, unknown> = {
            name: 'private prompt',
            code: 'secret token',
            statusCode: 12345,
        };
        error.cause = error;
        expect(cardAuthoringProviderFailure(error, 'private prompt')).toEqual({
            errorName: 'UnknownError',
        });
        expect(cardAuthoringProviderFailure(null, 'invalid')).toEqual({
            errorName: 'UnknownError',
        });
    });
});
