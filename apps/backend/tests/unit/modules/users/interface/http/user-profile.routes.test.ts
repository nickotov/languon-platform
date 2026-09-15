import { describe, expect, it, vi } from 'vitest';
import type { AuthenticationService } from '../../../../../../src/modules/authentication/application/authentication-service';
import type { AccessTokenSigner } from '../../../../../../src/modules/authentication/application/ports/access-token';
import { AuthHttpPolicy } from '../../../../../../src/modules/authentication/interface/http/auth-http-policy';
import {
    UserProfileConflictError,
    type UserProfileService,
} from '../../../../../../src/modules/users/application/user-profile-service';
import { UserHandleAlreadyExistsError } from '../../../../../../src/modules/users/domain/user.repository';
import {
    AccountDeletionConflictError,
    AccountDeletionJournalUnavailableError,
    AccountDeletionOwnerTransferRequiredError,
    type AccountDeletionService,
} from '../../../../../../src/modules/users/application/account-deletion-service';
import { RecentAuthenticationRequiredError } from '../../../../../../src/modules/authentication/application/authentication-errors';
import { createUserProfileRoutes } from '../../../../../../src/modules/users/interface/http/user-profile.routes';

const userId = '0198a941-8ace-7115-aec6-d2b594aaee06';
const sessionId = '0198a941-7824-7de6-8200-e54baa45a926';

function harness() {
    const updateHandle = vi.fn(
        async ({ handle }: { handle: string }) => handle,
    );
    const requireActiveSession = vi.fn(async () => ({}));
    const schedule = vi.fn(async () => ({
        scheduledAt: new Date('2026-09-15T10:00:00.000Z'),
        purgeAt: new Date('2026-10-15T10:00:00.000Z'),
        userVersion: 2,
    }));
    const verify = vi.fn(async () => ({ sessionId, userId }));
    const app = createUserProfileRoutes({
        accessTokens: { verify } as unknown as AccessTokenSigner,
        authentication: {
            requireActiveSession,
        } as unknown as AuthenticationService,
        deletions: { schedule } as unknown as AccountDeletionService,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['https://app.languon.example'],
            appEnvironment: 'production',
            refreshTokenTtlSeconds: 1_209_600,
        }),
        profiles: { updateHandle } as unknown as UserProfileService,
    });
    const request = (handle: unknown, origin = 'https://app.languon.example') =>
        app.request('/users/me/handle', {
            body: JSON.stringify({ handle }),
            headers: {
                Authorization: 'Bearer header.payload.signature',
                'Content-Type': 'application/json',
                Origin: origin,
            },
            method: 'PATCH',
        });
    return {
        app,
        request,
        requireActiveSession,
        schedule,
        updateHandle,
        verify,
    };
}

describe('user profile handle HTTP route', () => {
    it('normalizes ASCII input and requires the active session', async () => {
        const { request, requireActiveSession, updateHandle } = harness();
        const response = await request('  Learner_123  ');
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            handle: 'learner_123',
        });
        expect(updateHandle).toHaveBeenCalledWith(
            expect.objectContaining({ handle: 'learner_123', userId }),
        );
        expect(requireActiveSession).toHaveBeenCalledWith({
            sessionId,
            userId,
        });
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('rejects invalid handles and hostile origins before a profile write', async () => {
        const { request, updateHandle } = harness();
        expect((await request('a')).status).toBe(400);
        expect(
            (await request('valid_handle', 'https://hostile.example')).status,
        ).toBe(403);
        expect(updateHandle).not.toHaveBeenCalled();
    });

    it('maps competing claims and concurrent own-account changes to 409', async () => {
        const { request, updateHandle } = harness();
        updateHandle.mockRejectedValueOnce(new UserHandleAlreadyExistsError());
        const conflict = await request('claimed');
        expect(conflict.status).toBe(409);
        await expect(conflict.json()).resolves.toMatchObject({
            error: { code: 'conflict' },
        });
        updateHandle.mockRejectedValueOnce(new UserProfileConflictError());
        expect((await request('different')).status).toBe(409);
    });

    it('does not accept a missing bearer token', async () => {
        const { app, updateHandle } = harness();
        const response = await app.request('/users/me/handle', {
            body: JSON.stringify({ handle: 'learner' }),
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://app.languon.example',
            },
            method: 'PATCH',
        });
        expect(response.status).toBe(401);
        expect(updateHandle).not.toHaveBeenCalled();
    });
});

describe('account removal HTTP route', () => {
    const requestRemoval = (
        app: ReturnType<typeof harness>['app'],
        body: Record<string, unknown> = {},
        origin = 'https://app.languon.example',
    ) =>
        app.request('/users/me/deletion', {
            body: JSON.stringify(body),
            headers: {
                Authorization: 'Bearer header.payload.signature',
                'Content-Type': 'application/json',
                Origin: origin,
            },
            method: 'POST',
        });

    it('returns a dated 202 receipt and clears the refresh cookie after scheduling', async () => {
        const { app, schedule } = harness();
        const response = await requestRemoval(app);
        expect(response.status).toBe(202);
        await expect(response.json()).resolves.toMatchObject({
            status: 'deletion_scheduled',
            purgeAt: '2026-10-15T10:00:00.000Z',
        });
        expect(response.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
        expect(schedule).toHaveBeenCalledWith({ sessionId, userId });
    });

    it('rejects wrong confirmation and origin before invoking deletion', async () => {
        const { app, schedule } = harness();
        expect(
            (await requestRemoval(app, { unexpected: 'DELETE' })).status,
        ).toBe(400);
        expect(
            (await requestRemoval(app, {}, 'https://hostile.example')).status,
        ).toBe(403);
        expect(schedule).not.toHaveBeenCalled();
    });

    it('maps an owner-transfer failure to 409 without clearing the cookie', async () => {
        const { app, schedule } = harness();
        schedule.mockRejectedValueOnce(
            new AccountDeletionOwnerTransferRequiredError(),
        );
        const response = await requestRemoval(app);
        expect(response.status).toBe(409);
        expect(response.headers.get('Set-Cookie')).toBeNull();
    });

    it.each([
        [new RecentAuthenticationRequiredError(), 403],
        [new AccountDeletionConflictError(), 409],
        [new AccountDeletionJournalUnavailableError(), 503],
    ])('maps %s to %i without clearing the cookie', async (failure, status) => {
        const { app, schedule } = harness();
        schedule.mockRejectedValueOnce(failure);
        const response = await requestRemoval(app);
        expect(response.status).toBe(status);
        expect(response.headers.get('Set-Cookie')).toBeNull();
    });
});
