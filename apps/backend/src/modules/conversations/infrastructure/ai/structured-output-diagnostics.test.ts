import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
    completedStructuredFailure,
    structuredFinishReason,
    schemaFailureDiagnostic,
} from './structured-output-diagnostics';
import { generateTutorObject } from './tutor-request-agents';

describe('safe structured output failure classification', () => {
    it('projects only allowlisted paths and never echoes issue messages, values or unknown keys', () => {
        const error = new z.ZodError([
            {
                code: 'custom',
                path: [
                    'tasks',
                    0,
                    'private learner phrase',
                    'blocks',
                    2,
                    'referenceAnswer',
                ],
                message: 'secret provider output',
            },
        ]);

        expect(schemaFailureDiagnostic(error)).toEqual({
            code: 'schema-invalid',
            paths: ['tasks.0.blocks.2.referenceAnswer'],
        });

        expect(JSON.stringify(schemaFailureDiagnostic(error))).not.toContain(
            'secret',
        );

        expect(JSON.stringify(schemaFailureDiagnostic(error))).not.toContain(
            'private learner',
        );
    });

    it('recognizes nested completed SDK schema failures and output limits without assuming transport completion', () => {
        const cause = new z.ZodError([
            { code: 'custom', path: ['tasks'], message: 'untrusted' },
        ]);

        expect(
            completedStructuredFailure(new Error('wrapper', { cause })),
        ).toEqual({ code: 'schema-invalid', paths: ['tasks'] });

        const lengthError = Object.assign(new Error('untrusted output'), {
            name: 'AI_NoObjectGeneratedError',
            finishReason: 'length',
            cause,
        });

        expect(
            completedStructuredFailure(
                new Error('wrapper', { cause: lengthError }),
            ),
        ).toEqual({ code: 'output-limit', finishReason: 'length' });

        expect(
            completedStructuredFailure(new Error('connection lost')),
        ).toBeUndefined();
    });

    it('maps known content invariants to specific safe paths without exposing arbitrary error text', () => {
        expect(
            schemaFailureDiagnostic(
                new Error('Reference answer must name the correct choice.'),
            ),
        ).toEqual({
            code: 'content-invalid',
            paths: ['referenceAnswer', 'correctChoiceId'],
        });

        expect(
            schemaFailureDiagnostic(new Error('private learner sentence')),
        ).toEqual({ code: 'content-invalid' });
    });

    it.each([
        'stop',
        'length',
        'content-filter',
        'tool-calls',
        'error',
        'other',
        'unknown',
    ] as const)(
        'normalizes a v3/v4 %s terminal frame without retaining the raw upstream string',
        (unified) => {
            expect(
                structuredFinishReason({
                    unified,
                    raw: 'private provider data',
                }),
            ).toBe(unified);

            expect(structuredFinishReason({ raw: unified })).toBe('unknown');
        },
    );

    it('accepts usable full output from an unrecognized terminal finish', async () => {
        const object = { text: 'fixture' };
        await expect(
            generateTutorObject({
                agent: { generate: async () => ({ object }) } as never,
                prompt: 'fixture',
                schema: z.object({ text: z.string() }),
                signal: new AbortController().signal,
                operationId: 'fixture',
                maxOutputTokens: 4096,
                completedResponse: () => 'other',
            }),
        ).resolves.toEqual(object);
    });

    it('uses the settled receipt when the SDK object getter fails after generation', async () => {
        const failure = new Error('opaque decoder failure');
        const input = {
            agent: {
                generate: async () => ({
                    get object() {
                        throw failure;
                    },
                }),
            } as never,
            prompt: 'synthetic',
            schema: z.object({}),
            signal: new AbortController().signal,
            operationId: 'synthetic',
            maxOutputTokens: 4096,
        };

        await expect(generateTutorObject(input)).rejects.toBe(failure);
        await expect(
            generateTutorObject({
                ...input,
                completedResponse: () => 'stop',
            }),
        ).rejects.toMatchObject({ reason: 'invalid-output' });
    });

    it.each(['stop', 'tool-calls'] as const)(
        'recovers an opaque decode error after one measured %s completion',
        async (reason) => {
            await expect(
                generateTutorObject({
                    agent: {
                        generate: async () => {
                            throw new Error('opaque SDK failure');
                        },
                    } as never,
                    prompt: 'fixture',
                    schema: z.object({}),
                    signal: new AbortController().signal,
                    operationId: 'fixture',
                    maxOutputTokens: 4096,
                    completedResponse: () => reason,
                }),
            ).rejects.toMatchObject({
                reason: 'invalid-output',
                diagnostic: {
                    code: 'schema-invalid',
                    phase: 'decode',
                    finishReason: reason,
                },
            });
        },
    );

    it.each([
        ['content-filter', 'provider-rejected'],
        ['error', 'provider-rejected'],
        ['other', 'content-invalid'],
        ['unknown', 'content-invalid'],
    ] as const)(
        'never repairs measured %s even when Mastra wraps it as a decoder failure',
        async (reason, code) => {
            const typed = Object.assign(new Error('withheld'), {
                name: 'AI_NoObjectGeneratedError',
            });
            const generate = vi.fn(async () => {
                throw typed;
            });

            await expect(
                generateTutorObject({
                    agent: { generate } as never,
                    prompt: 'fixture',
                    schema: z.object({}),
                    signal: new AbortController().signal,
                    operationId: 'fixture',
                    maxOutputTokens: 4096,
                    completedResponse: () => reason,
                }),
            ).rejects.toMatchObject({
                generationFailure: {
                    code,
                    phase: 'decode',
                    finishReason: reason,
                },
            });

            expect(generate).toHaveBeenCalledTimes(1);
        },
    );

    it.each(['invalid-object', 'length', 'candidate'] as const)(
        'never authorizes repair or publication of %s without exactly one measured finish',
        async (mode) => {
            const generate = async () => {
                if (mode === 'invalid-object') {
                    throw Object.assign(new Error('withheld'), {
                        name: 'AI_NoObjectGeneratedError',
                    });
                }

                return {
                    finishReason: mode === 'length' ? 'length' : 'stop',
                    object: {},
                };
            };

            await expect(
                generateTutorObject({
                    agent: { generate } as never,
                    prompt: 'fixture',
                    schema: z.object({}),
                    operationId: 'fixture',
                    signal: new AbortController().signal,
                    maxOutputTokens: 4096,
                    completedResponse: () => undefined,
                }),
            ).rejects.toMatchObject({
                generationFailure: { code: 'publication', phase: 'receipt' },
            });
        },
    );

    it('preserves an SDK-wrapped refusal even without a gate receipt', async () => {
        const refusal = Object.assign(new Error('withheld'), {
            name: 'AI_NoObjectGeneratedError',
            finishReason: 'content-filter',
        });

        await expect(
            generateTutorObject({
                agent: {
                    generate: async () => {
                        throw new Error('wrapper', { cause: refusal });
                    },
                } as never,
                prompt: 'fixture',
                schema: z.object({}),
                signal: new AbortController().signal,
                operationId: 'fixture',
                maxOutputTokens: 4096,
            }),
        ).rejects.toMatchObject({
            generationFailure: {
                code: 'provider-rejected',
                phase: 'decode',
                finishReason: 'content-filter',
            },
        });
    });

    it.each(['abort', 'tripwire'])(
        'preserves %s even with a completed provider receipt',
        async (mode) => {
            const controller = new AbortController();
            const completedResponse = vi.fn(() => 'stop' as const);
            const generate = async () => {
                if (mode === 'abort') {
                    controller.abort();
                }

                return { tripwire: mode === 'tripwire' };
            };

            await expect(
                generateTutorObject({
                    agent: { generate } as never,
                    prompt: 'synthetic',
                    schema: z.object({}),
                    signal: controller.signal,
                    operationId: 'synthetic',
                    maxOutputTokens: 4096,
                    completedResponse,
                }),
            ).rejects.toThrow();

            expect(completedResponse).not.toHaveBeenCalled();
        },
    );

    it('normalizes actual agent error results but never retries an ambiguous request itself', async () => {
        const schemaError = Object.assign(new Error('untrusted'), {
            name: 'AI_TypeValidationError',
        });
        const generate = vi
            .fn()
            .mockResolvedValueOnce({ error: schemaError })
            .mockRejectedValueOnce(new Error('network uncertain'));
        const input = {
            agent: { generate } as never,
            prompt: 'synthetic',
            schema: z.object({}),
            signal: new AbortController().signal,
            operationId: 'synthetic',
            maxOutputTokens: 4096,
        };

        await expect(generateTutorObject(input)).rejects.toMatchObject({
            reason: 'invalid-output',
            diagnostic: { code: 'schema-invalid' },
        });

        await expect(generateTutorObject(input)).rejects.toThrow(
            'network uncertain',
        );

        expect(generate).toHaveBeenCalledTimes(2);
        expect(generate.mock.calls[0]![1]).toMatchObject({
            modelSettings: { maxRetries: 0 },
        });
    });
});
