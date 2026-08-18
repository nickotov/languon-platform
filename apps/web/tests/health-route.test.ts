import { afterEach, describe, expect, it } from 'vitest';

import { GET } from '@/app/healthz/route';

describe('web health route', () => {
    const originalRelease = process.env.RELEASE_SHA;

    afterEach(() => {
        if (originalRelease === undefined) {
            delete process.env.RELEASE_SHA;
        } else {
            process.env.RELEASE_SHA = originalRelease;
        }
    });

    it('returns release identity and disables caching', async () => {
        process.env.RELEASE_SHA = 'abcdef1234567890';

        const response = GET();

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        await expect(response.json()).resolves.toEqual({
            release: 'abcdef1234567890',
            service: 'web',
            status: 'ok',
        });
    });
});
