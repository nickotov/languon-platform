import { describe, expect, it } from 'vitest';
import { sentenceProviderFailure } from '../../../../../../src/modules/learning/infrastructure/ai/sentence-provider-failure';

describe('sentenceProviderFailure', () => {
    it('recognizes the retired Kie model inside an HTTP 200 SDK failure', () => {
        expect(
            sentenceProviderFailure(
                {
                    name: 'AI_APICallError',
                    message: 'Invalid JSON response',
                    statusCode: 200,
                    responseBody: JSON.stringify({
                        code: 410,
                        msg: 'Gemini2.5Pro retired upstream; private content',
                    }),
                },
                'kie',
            ),
        ).toEqual({
            reason: 'model_retired',
            errorName: 'AI_APICallError',
            httpStatus: 200,
            providerCode: 410,
        });
    });

    it.each([
        [401, 'authorization_failed'],
        [403, 'provider_unavailable'],
        [402, 'provider_credits_exhausted'],
        [404, 'model_unavailable'],
        [410, 'model_retired'],
        [429, 'rate_limited'],
        [500, 'provider_unavailable'],
    ])('classifies HTTP %i without returning its message', (code, reason) => {
        expect(
            sentenceProviderFailure(
                { statusCode: code, message: 'secret' },
                'deepseek',
            ),
        ).toEqual({ reason, httpStatus: code });
    });

    it.each([
        [401, 'authorization_failed'],
        [403, 'provider_unavailable'],
        [402, 'provider_credits_exhausted'],
        [429, 'rate_limited'],
    ])('classifies Kie envelope code %i', (code, reason) => {
        expect(
            sentenceProviderFailure(
                { responseBody: JSON.stringify({ code }) },
                'kie',
            ),
        ).toEqual({ reason, providerCode: code });
    });

    it('reads nested causes without masking an internal rejection with HTTP 200', () => {
        expect(
            sentenceProviderFailure(
                {
                    name: 'AI_RetryError',
                    statusCode: 200,
                    cause: { cause: { responseBody: '{"code":410}' } },
                },
                'kie',
            ),
        ).toEqual({
            reason: 'model_retired',
            errorName: 'AI_RetryError',
            httpStatus: 200,
            providerCode: 410,
        });
    });

    it('prefers an actual nested HTTP failure over an outer successful status', () => {
        expect(
            sentenceProviderFailure(
                { statusCode: 200, cause: { statusCode: 401 } },
                'kie',
            ),
        ).toEqual({ reason: 'authorization_failed', httpStatus: 401 });
    });

    it('does not interpret other providers as Kie envelopes', () => {
        expect(
            sentenceProviderFailure(
                { responseBody: '{"code":410}' },
                'deepseek',
            ),
        ).toEqual({ reason: 'provider_unavailable' });
    });

    it.each([
        'not-json',
        '{"code":"410"}',
        '{"code":410.5}',
        '{"code":999}',
        '{"code":200}',
        '{"msg":"model retired"}',
        ' '.repeat(16_385),
        JSON.stringify({ code: 410, msg: 'x'.repeat(16_384) }),
    ])('ignores invalid or oversized envelope %#', (responseBody) => {
        expect(sentenceProviderFailure({ responseBody }, 'kie')).toEqual({
            reason: 'provider_unavailable',
        });
    });

    it('accepts a valid envelope at the exact body size limit', () => {
        const responseBody = '{"code":410}'.padEnd(16_384);
        expect(sentenceProviderFailure({ responseBody }, 'kie')).toEqual({
            reason: 'model_retired',
            providerCode: 410,
        });
    });

    it.each([
        undefined,
        null,
        'secret',
        1,
        { statusCode: NaN },
        { statusCode: 600 },
    ])('handles unknown failure %#', (error) => {
        expect(sentenceProviderFailure(error, 'kie')).toEqual({
            reason: 'provider_unavailable',
        });
    });

    it('bounds cyclic causes and ignores a fourth object', () => {
        const cycle: { cause?: unknown } = {};
        cycle.cause = cycle;
        expect(sentenceProviderFailure(cycle, 'kie')).toEqual({
            reason: 'provider_unavailable',
        });
        expect(
            sentenceProviderFailure(
                {
                    cause: {
                        cause: { cause: { responseBody: '{"code":410}' } },
                    },
                },
                'kie',
            ),
        ).toEqual({ reason: 'provider_unavailable' });
    });

    it('only includes allowlisted names and transport codes, never sensitive text', () => {
        const error = {
            name: 'SECRET_TOKEN',
            code: 'SECRET_TOKEN',
            message: 'SECRET_TOKEN',
            responseBody: '{"code":410,"msg":"SECRET_TOKEN"}',
            requestBodyValues: { prompt: 'SECRET_TOKEN' },
            headers: { Authorization: 'SECRET_TOKEN' },
            cause: { name: 'TypeError', code: 'ECONNRESET' },
        };
        expect(sentenceProviderFailure(error, 'kie')).toEqual({
            reason: 'model_retired',
            providerCode: 410,
            errorName: 'TypeError',
            transportCode: 'ECONNRESET',
        });
        expect(
            JSON.stringify(sentenceProviderFailure(error, 'kie')),
        ).not.toContain('SECRET_TOKEN');
    });

    it('does not trust a message claiming that the model is retired', () => {
        expect(
            sentenceProviderFailure(
                { message: 'Gemini retired upstream' },
                'kie',
            ),
        ).toEqual({ reason: 'provider_unavailable' });
    });

    it('tolerates throwing properties on unknown errors', () => {
        expect(
            sentenceProviderFailure(
                Object.defineProperty({}, 'responseBody', {
                    get() {
                        throw new Error('SECRET_TOKEN');
                    },
                }),
                'kie',
            ),
        ).toEqual({ reason: 'provider_unavailable' });
    });
});

describe('reviewed gateway error envelopes', () => {
    it.each(['openrouter', 'evolink'])(
        'classifies numeric nested retirement safely for %s',
        (providerId) => {
            const result = sentenceProviderFailure(
                {
                    name: 'AI_APICallError',
                    statusCode: 200,
                    responseBody: JSON.stringify({
                        error: {
                            code: 410,
                            message: 'synthetic-secret-never-log',
                        },
                    }),
                },
                providerId,
            );
            expect(result).toEqual({
                reason: 'model_retired',
                errorName: 'AI_APICallError',
                httpStatus: 200,
                providerCode: 410,
            });
            expect(JSON.stringify(result)).not.toContain('synthetic-secret');
        },
    );
});

describe('bounded schema rejection diagnostics', () => {
    it('recognizes only an explicit schema machine code and field on HTTP 400', () => {
        expect(
            sentenceProviderFailure(
                {
                    statusCode: 400,
                    responseBody: JSON.stringify({
                        error: {
                            code: 'invalid_json_schema',
                            param: 'response_format',
                            message: 'private schema text',
                        },
                    }),
                },
                'openrouter',
            ),
        ).toMatchObject({ reason: 'schema_incompatible', httpStatus: 400 });
        expect(
            sentenceProviderFailure(
                {
                    statusCode: 400,
                    responseBody: JSON.stringify({
                        error: {
                            code: 'invalid_request',
                            param: 'response_format',
                        },
                    }),
                },
                'openrouter',
            ).reason,
        ).toBe('provider_unavailable');
        expect(
            sentenceProviderFailure(
                {
                    statusCode: 400,
                    responseBody: JSON.stringify({
                        error: {
                            code: 'invalid_json_schema',
                            param: 'messages',
                        },
                    }),
                },
                'openrouter',
            ).reason,
        ).toBe('provider_unavailable');
    });
    it('classifies numeric streamed error codes without exposing their messages', () => {
        expect(
            sentenceProviderFailure(
                { code: 401, message: 'private stream detail' },
                'openrouter',
            ),
        ).toEqual({ reason: 'authorization_failed', providerCode: 401 });
    });
});

describe('policy refusal isolation', () => {
    it('does not label generic HTTP403 as invalid shared credentials', () => {
        expect(
            sentenceProviderFailure(
                {
                    statusCode: 403,
                    responseBody: JSON.stringify({
                        error: {
                            code: 403,
                            message: 'Synthetic policy refusal',
                        },
                    }),
                },
                'openrouter',
            ),
        ).toMatchObject({ reason: 'provider_unavailable', httpStatus: 403 });
        expect(
            sentenceProviderFailure(
                {
                    statusCode: 403,
                    responseBody: JSON.stringify({
                        error: {
                            code: 401,
                            message: 'Synthetic credential rejection',
                        },
                    }),
                },
                'openrouter',
            ),
        ).toMatchObject({ reason: 'authorization_failed', providerCode: 401 });
    });
});
