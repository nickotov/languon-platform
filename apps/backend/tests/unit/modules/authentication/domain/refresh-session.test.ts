import { describe, expect, it } from 'vitest';

import {
    RefreshSession,
    type RefreshSessionUnavailableError,
} from '../../../../../src/modules/authentication/domain/refresh-session';

const issuedAt = new Date('2026-08-13T10:00:00.000Z');
const expiresAt = new Date('2026-08-27T10:00:00.000Z');

function createSession(): RefreshSession {
    return RefreshSession.issue({
        authenticatedAt: issuedAt,
        expiresAt,
        familyId: '0198a941-7824-7de6-8200-e54baa45a926',
        id: '0198a941-8ace-7115-aec6-d2b594aaee06',
        issuedAt,
        refreshDigest: 'digest-1',
        userId: '0198a941-9498-7b8f-be17-cac0b0aca5b9',
    });
}

describe('RefreshSession', () => {
    it('rotates once without extending the absolute family expiry', () => {
        const now = new Date('2026-08-14T10:00:00.000Z');
        const original = createSession();
        const { consumed, successor } = original.rotate({
            id: '0198ae67-e5c9-7db9-8817-d5bcac84e143',
            now,
            refreshDigest: 'digest-2',
        });

        expect(consumed.consumedAt).toEqual(now);
        expect(consumed.successorId).toBe(successor.id);
        expect(successor).toMatchObject({
            authenticatedAt: issuedAt,
            expiresAt,
            familyId: original.familyId,
            refreshDigest: 'digest-2',
            userId: original.userId,
        });
    });

    it('rejects reuse after the refresh credential was consumed', () => {
        const { consumed } = createSession().rotate({
            id: '0198ae67-e5c9-7db9-8817-d5bcac84e143',
            now: issuedAt,
            refreshDigest: 'digest-2',
        });

        expect(() =>
            consumed.rotate({
                id: '0198ae67-f12a-70cc-a174-e3d2e32c30c7',
                now: issuedAt,
                refreshDigest: 'digest-3',
            }),
        ).toThrowError(
            expect.objectContaining<Partial<RefreshSessionUnavailableError>>({
                reason: 'consumed',
            }),
        );
    });

    it('rejects rotation at the exact absolute expiry boundary', () => {
        expect(() =>
            createSession().rotate({
                id: '0198ae67-e5c9-7db9-8817-d5bcac84e143',
                now: expiresAt,
                refreshDigest: 'digest-2',
            }),
        ).toThrowError(
            expect.objectContaining<Partial<RefreshSessionUnavailableError>>({
                reason: 'expired',
            }),
        );
    });

    it('revokes idempotently and prevents later rotation', () => {
        const revokedAt = new Date('2026-08-13T10:01:00.000Z');
        const revoked = createSession().revoke(revokedAt, 'logout');

        expect(revoked.revoke(revokedAt, 'logout')).toBe(revoked);
        expect(() =>
            revoked.rotate({
                id: '0198ae67-e5c9-7db9-8817-d5bcac84e143',
                now: revokedAt,
                refreshDigest: 'digest-2',
            }),
        ).toThrowError(
            expect.objectContaining<Partial<RefreshSessionUnavailableError>>({
                reason: 'revoked',
            }),
        );
    });
});
