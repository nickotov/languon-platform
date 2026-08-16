import { describe, expect, it } from 'vitest';

import {
    DevelopmentPrincipalAuthorizationError,
    DevelopmentVerificationService,
} from '../../../../../src/modules/development-harness/application/development-verification-service';
import type { DevelopmentPrincipalReader } from '../../../../../src/modules/development-harness/application/ports/development-principal-reader';

const principalId = '00000000-0000-4000-8000-000000000019';

function service(
    principal: Awaited<ReturnType<DevelopmentPrincipalReader['findById']>>,
) {
    return new DevelopmentVerificationService(
        { findById: async () => principal },
        principalId,
    );
}

describe('DevelopmentVerificationService', () => {
    it('resolves only the active verified synthetic principal', async () => {
        await expect(
            service({
                email: 'mastra-playground@example.test',
                id: principalId,
                status: 'active',
                verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
            }).verifyPrincipal({
                message: 'hello',
                principalId,
                variant: 'diagnostic',
            }),
        ).resolves.toEqual({
            email: 'mastra-playground@example.test',
            message: 'hello',
            principalId,
            variant: 'diagnostic',
        });
    });

    it.each([
        ['missing', null],
        [
            'pending',
            {
                email: 'mastra-playground@example.test',
                id: principalId,
                status: 'pending' as const,
                verifiedAt: null,
            },
        ],
        [
            'unverified',
            {
                email: 'mastra-playground@example.test',
                id: principalId,
                status: 'active' as const,
                verifiedAt: null,
            },
        ],
    ])('rejects a %s fixture', async (_name, principal) => {
        await expect(
            service(principal).verifyPrincipal({
                message: 'hello',
                principalId,
                variant: 'concise',
            }),
        ).rejects.toBeInstanceOf(DevelopmentPrincipalAuthorizationError);
    });

    it('rejects an arbitrary context identity before repository access', async () => {
        let accessed = false;
        const verification = new DevelopmentVerificationService(
            {
                findById: async () => {
                    accessed = true;
                    return null;
                },
            },
            principalId,
        );

        await expect(
            verification.verifyPrincipal({
                message: 'hello',
                principalId: '00000000-0000-4000-8000-000000000099',
                variant: 'concise',
            }),
        ).rejects.toBeInstanceOf(DevelopmentPrincipalAuthorizationError);
        expect(accessed).toBe(false);
    });

    it('preserves cancellation', async () => {
        const controller = new AbortController();
        controller.abort(new DOMException('Stopped', 'AbortError'));

        await expect(
            service(null).verifyPrincipal({
                message: 'hello',
                principalId,
                signal: controller.signal,
                variant: 'concise',
            }),
        ).rejects.toMatchObject({ name: 'AbortError' });
    });
});
