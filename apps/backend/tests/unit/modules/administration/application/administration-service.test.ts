import { describe, expect, it, vi } from 'vitest';

import type { AuthenticationService } from '../../../../../src/modules/authentication/application/authentication-service';
import { RecentAuthenticationRequiredError } from '../../../../../src/modules/authentication/application/authentication-errors';
import type { AccessTokenSigner } from '../../../../../src/modules/authentication/application/ports/access-token';
import type { Clock } from '../../../../../src/modules/authentication/application/ports/clock';
import type { IdGenerator } from '../../../../../src/modules/authentication/application/ports/id-generator';
import {
    AdminAccessDeniedError,
    AdminSelfDisableForbiddenError,
} from '../../../../../src/modules/administration/application/administration-errors';
import { AdministrationService } from '../../../../../src/modules/administration/application/administration-service';
import type { AdministrationStore } from '../../../../../src/modules/administration/application/ports/administration-store';

const actorId = '0198c200-2cf4-7d47-9db5-337544133323';
const targetId = '0198c200-6e90-7caa-a0ce-93e7faf1405f';
const sessionId = '0198c200-9c28-7d02-81d4-1ea13de886a8';
const now = new Date('2026-08-20T08:00:00.000Z');

function setup(options: { membership?: boolean } = {}) {
    const store = {
        cancelUserDeletion: vi.fn().mockResolvedValue({ id: targetId }),
        dashboard: vi.fn(),
        disableUser: vi.fn().mockResolvedValue({ id: targetId }),
        findActiveMembership: vi.fn().mockResolvedValue(
            options.membership === false
                ? null
                : {
                      grantedAt: now,
                      id: '0198c201-599f-7ee5-98e2-932611f20abe',
                      role: 'owner',
                      userId: actorId,
                  },
        ),
        findUser: vi.fn(),
        listAuditEvents: vi.fn(),
        listUsers: vi.fn(),
        recordAudit: vi.fn().mockResolvedValue(undefined),
        restoreUser: vi.fn().mockResolvedValue({ id: targetId }),
    } as unknown as AdministrationStore;
    const authentication = {
        requireActiveSession: vi.fn().mockResolvedValue({
            account: { email: 'Owner@Example.com' },
            session: { id: sessionId },
        }),
        requireRecentlyAuthenticatedSession: vi.fn().mockResolvedValue({}),
    } as unknown as AuthenticationService;
    const accessTokens = {
        verify: vi.fn().mockResolvedValue({
            sessionId,
            userId: actorId,
        }),
    } as unknown as AccessTokenSigner;
    let sequence = 0;
    const ids = {
        generate: () =>
            [
                '0198c202-0d06-7757-a7db-aef28ec4c747',
                '0198c202-45a1-7fa1-bbb3-b9a32a340b20',
                '0198c202-727d-7685-b926-1a9b2e8ef8be',
            ][sequence++] ?? '0198c202-9d49-7559-ac35-d13762fc3ee2',
    } satisfies IdGenerator;
    const clock = { now: () => now } satisfies Clock;
    return {
        authentication,
        service: new AdministrationService({
            accessTokens,
            authentication,
            clock,
            ids,
            store,
        }),
        store,
    };
}

describe('AdministrationService', () => {
    it('requires recent admin authentication and a distinct audited cancellation action', async () => {
        const { authentication, service, store } = setup();
        const input = {
            expectedVersion: 3,
            reason: 'Verified cancellation requested by support',
        };
        const correlationId = '0198c203-6b64-71cd-877b-752ff3fe056f';

        await service.cancelUserDeletion(
            'access-token', targetId, input, correlationId,
        );
        expect(authentication.requireRecentlyAuthenticatedSession)
            .toHaveBeenCalledWith({ sessionId, userId: actorId });
        expect(store.cancelUserDeletion).toHaveBeenCalledWith(
            expect.objectContaining({
                actorSessionId: sessionId,
                actorUserId: actorId,
                expectedVersion: input.expectedVersion,
                reason: input.reason,
                targetUserId: targetId,
                audit: expect.objectContaining({ correlationId }),
            }),
        );
    });
    it('authorizes from active persisted membership instead of token claims', async () => {
        const { service, store } = setup();

        await expect(service.currentActor('access-token')).resolves.toEqual({
            id: actorId,
            primaryEmail: 'owner@example.com',
            role: 'owner',
        });
        expect(store.findActiveMembership).toHaveBeenCalledWith(actorId);
    });

    it('rejects a valid user without membership and records a bounded event', async () => {
        const { service, store } = setup({ membership: false });

        await expect(service.dashboard('access-token')).rejects.toBeInstanceOf(
            AdminAccessDeniedError,
        );
        expect(store.recordAudit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'access_denied',
                actorUserId: actorId,
                outcome: 'rejected',
                reason: 'Administrator membership is not active',
            }),
        );
    });

    it('records an authorized recent-authentication rejection', async () => {
        const { authentication, service, store } = setup();
        vi.mocked(
            authentication.requireRecentlyAuthenticatedSession,
        ).mockRejectedValue(new RecentAuthenticationRequiredError());
        vi.mocked(store.findUser).mockResolvedValue({
            id: targetId,
            status: 'active',
            version: 7,
        } as never);

        await expect(
            service.restoreUser(
                'access-token',
                targetId,
                { expectedVersion: 6, reason: 'Reviewed restore request' },
                '0198c203-7c47-7334-9488-a1a5175127a5',
            ),
        ).rejects.toBeInstanceOf(RecentAuthenticationRequiredError);

        expect(store.recordAudit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'user_restored',
                beforeStatus: 'active',
                beforeVersion: 7,
                correlationId: '0198c203-7c47-7334-9488-a1a5175127a5',
                metadata: expect.objectContaining({
                    expectedVersion: 6,
                    rejection: 'recent_authentication_required',
                }),
                outcome: 'rejected',
                targetUserId: targetId,
            }),
        );
    });

    it('requires recent authentication before status mutation', async () => {
        const { authentication, service, store } = setup();

        await service.disableUser(
            'access-token',
            targetId,
            { expectedVersion: 2, reason: 'Confirmed policy violation' },
            '0198c203-0b1f-77dc-847c-8d023c81f03b',
        );

        expect(
            authentication.requireRecentlyAuthenticatedSession,
        ).toHaveBeenCalledWith({ sessionId, userId: actorId });
        expect(store.disableUser).toHaveBeenCalledWith(
            expect.objectContaining({
                actorSessionId: sessionId,
                actorUserId: actorId,
                expectedVersion: 2,
                reason: 'Confirmed policy violation',
                targetUserId: targetId,
            }),
        );
    });

    it('rejects self-disable before touching persistence and audits the attempt', async () => {
        const { service, store } = setup();
        vi.mocked(store.findUser).mockResolvedValue({
            id: actorId,
            status: 'active',
            version: 5,
        } as never);

        await expect(
            service.disableUser(
                'access-token',
                actorId,
                { expectedVersion: 4, reason: 'Operator requested disable' },
                '0198c203-5049-711a-81e9-b173b201c71d',
            ),
        ).rejects.toBeInstanceOf(AdminSelfDisableForbiddenError);

        expect(store.disableUser).not.toHaveBeenCalled();
        expect(store.recordAudit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'user_disabled',
                beforeStatus: 'active',
                beforeVersion: 5,
                metadata: {
                    expectedVersion: 4,
                    rejection: 'self_disable_forbidden',
                    requestedTargetUserId: actorId,
                },
                targetUserId: actorId,
                outcome: 'rejected',
            }),
        );
    });
});
