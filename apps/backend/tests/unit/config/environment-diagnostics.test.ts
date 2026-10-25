import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { parseEnvironmentSchema } from '../../../src/config/environment-diagnostics';

function diagnostics() {
    return { error: vi.fn(), warn: vi.fn() };
}

describe('environment diagnostics', () => {
    it('returns parsed values and names missing fallback settings without logging values', () => {
        const logger = diagnostics();
        const schema = z.object({
            OPTIONAL_SECRET: z.string().optional(),
            REQUIRED_SECRET: z.string().min(1),
            TIMEOUT_MS: z.coerce.number().default(180_000),
        });

        expect(
            parseEnvironmentSchema(
                schema,
                { REQUIRED_SECRET: 'synthetic-private-value' },
                logger,
            ),
        ).toEqual({
            REQUIRED_SECRET: 'synthetic-private-value',
            TIMEOUT_MS: 180_000,
        });
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn.mock.calls[0]?.[0]).toContain('TIMEOUT_MS');
        expect(logger.warn.mock.calls[0]?.[0]).not.toContain('180000');
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('keeps explicitly configured values and absent optional settings quiet', () => {
        const logger = diagnostics();

        expect(
            parseEnvironmentSchema(
                z.object({
                    OPTIONAL_SECRET: z.string().optional(),
                    TIMEOUT_MS: z.coerce.number().default(180_000),
                }),
                { TIMEOUT_MS: '45000' },
                logger,
            ),
        ).toEqual({ TIMEOUT_MS: 45_000 });
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('does not report intentionally configured empty string settings as missing', () => {
        const logger = diagnostics();
        expect(
            parseEnvironmentSchema(
                z.object({ FORMATS: z.string().default('') }),
                { FORMATS: '' },
                logger,
            ),
        ).toEqual({ FORMATS: '' });
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('diagnoses required and invalid keys without exposing supplied credentials', () => {
        const logger = diagnostics();

        expect(() =>
            parseEnvironmentSchema(
                z.object({
                    API_KEY: z.string().min(32),
                    REQUIRED_URL: z.url(),
                    MODE: z.enum(['test', 'production']),
                }),
                {
                    API_KEY: 'synthetic-private-key',
                    MODE: 'synthetic-private-mode',
                },
                logger,
            ),
        ).toThrow(z.ZodError);
        expect(logger.error).toHaveBeenCalledTimes(1);
        const logged = logger.error.mock.calls[0]?.[0];
        expect(logged).toContain('API_KEY');
        expect(logged).toContain('REQUIRED_URL');
        expect(logged).toContain('MODE');
        expect(logged).not.toContain('synthetic-private-key');
        expect(logged).not.toContain('synthetic-private-mode');
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('treats a blank value as missing when the schema defines that fallback', () => {
        const logger = diagnostics();
        const schema = z.object({
            TIMEOUT_MS: z.preprocess(
                (value) => (value === '' ? undefined : value),
                z.coerce.number().default(180_000),
            ),
        });

        expect(
            parseEnvironmentSchema(schema, { TIMEOUT_MS: '' }, logger),
        ).toEqual({ TIMEOUT_MS: 180_000 });
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn.mock.calls[0]?.[0]).toContain('TIMEOUT_MS');
    });
});
