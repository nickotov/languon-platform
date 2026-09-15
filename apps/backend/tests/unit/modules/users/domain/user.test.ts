import { describe, expect, it } from 'vitest';

import {
    InvalidUserTransitionError,
    User,
} from '../../../../../src/modules/users/domain/user';

const userId = '0198a8dc-9aca-7b1d-a791-81a52953dcca';
const createdAt = new Date('2026-08-13T08:00:00.000Z');

describe('User', () => {
    it('creates a stable pending identity', () => {
        const user = User.createPending({ id: userId, now: createdAt });

        expect(user).toMatchObject({
            createdAt,
            id: userId,
            handle: null,
            status: 'pending',
            updatedAt: createdAt,
            version: 1,
        });
        expect(Object.keys(user)).not.toEqual(
            expect.arrayContaining([
                'password',
                'passwordHash',
                'passkeys',
                'refreshToken',
                'session',
            ]),
        );
    });

    it('activates a pending identity without changing its id or creation time', () => {
        const user = User.createPending({ id: userId, now: createdAt });
        const activatedAt = new Date('2026-08-13T08:05:00.000Z');

        const active = user.activate(activatedAt);

        expect(active).toMatchObject({
            createdAt,
            id: userId,
            status: 'active',
            updatedAt: activatedAt,
            version: 2,
        });
    });

    it('does not mutate an already-active identity when activation repeats', () => {
        const active = User.createPending({
            id: userId,
            now: createdAt,
        }).activate(new Date('2026-08-13T08:05:00.000Z'));

        expect(active.activate(new Date('2026-08-13T08:06:00.000Z'))).toBe(
            active,
        );
    });

    it('changes only an active account handle with a new version', () => {
        const active = User.createPending({ id: userId, now: createdAt }).activate(createdAt);
        const updated = active.withHandle('learner_123', new Date('2026-08-13T09:00:00.000Z'));
        expect(updated).toMatchObject({ handle: 'learner_123', status: 'active', version: 3 });
        expect(active.handle).toBeNull();
        expect(() => active.withHandle('Bad Handle', createdAt)).toThrow();
    });

    it('does not allow a disabled identity to become active', () => {
        const disabled = User.restore({
            createdAt,
            id: userId,
            handle: null,
            status: 'disabled',
            updatedAt: createdAt,
            version: 2,
        });

        expect(() => disabled.activate(new Date())).toThrow(
            InvalidUserTransitionError,
        );
    });

    it('disables active and pending identities with a new version', () => {
        const disabledAt = new Date('2026-08-13T09:00:00.000Z');
        const pending = User.createPending({ id: userId, now: createdAt });
        const active = pending.activate(new Date('2026-08-13T08:05:00.000Z'));

        expect(pending.disable(disabledAt)).toMatchObject({
            status: 'disabled',
            updatedAt: disabledAt,
            version: 2,
        });
        expect(active.disable(disabledAt)).toMatchObject({
            status: 'disabled',
            updatedAt: disabledAt,
            version: 3,
        });
    });

    it('rejects repeated disablement', () => {
        const disabled = User.createPending({
            id: userId,
            now: createdAt,
        }).disable(new Date('2026-08-13T09:00:00.000Z'));

        expect(() => disabled.disable(new Date())).toThrow(
            InvalidUserTransitionError,
        );
    });

    it('restores verified identities to active and unverified identities to pending', () => {
        const restoredAt = new Date('2026-08-13T10:00:00.000Z');
        const disabled = User.createPending({
            id: userId,
            now: createdAt,
        }).disable(new Date('2026-08-13T09:00:00.000Z'));

        expect(disabled.restoreAvailability(true, restoredAt)).toMatchObject({
            status: 'active',
            updatedAt: restoredAt,
            version: 3,
        });
        expect(disabled.restoreAvailability(false, restoredAt)).toMatchObject({
            status: 'pending',
            updatedAt: restoredAt,
            version: 3,
        });
    });

    it('only restores disabled identities', () => {
        const pending = User.createPending({ id: userId, now: createdAt });

        expect(() => pending.restoreAvailability(true, new Date())).toThrow(
            InvalidUserTransitionError,
        );
    });
});
