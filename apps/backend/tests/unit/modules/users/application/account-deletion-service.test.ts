import { describe, expect, it, vi } from 'vitest';

import {
    AccountDeletionJournalUnavailableError,
    AccountDeletionService,
} from '../../../../../src/modules/users/application/account-deletion-service';
import type { AccountDeletionRecoveryJournal } from '../../../../../src/modules/users/application/ports/account-deletion-recovery-journal';
import type { AccountDeletionStore } from '../../../../../src/modules/users/application/ports/account-deletion-store';

const userId = '01994b76-943c-7c04-aa71-883389879861';
const sessionId = '01994b76-943c-7c04-aa71-883389879862';
const scheduledAt = new Date('2026-09-15T10:00:00.000Z');

function harness() {
    const recordBlockingIntent = vi.fn(async () => {});
    const recordCommittedDeletion = vi.fn(async () => {});
    const requestCancellation = vi.fn(async () => {});
    const schedule = vi.fn(
        async (input: Parameters<AccountDeletionStore['schedule']>[0]) => {
            await input.beforeCommit(2, scheduledAt);
            return {
                scheduledAt,
                purgeAt: new Date('2026-10-15T10:00:00.000Z'),
                userVersion: 2,
            };
        },
    );
    const service = new AccountDeletionService({
        authentication: {
            requireRecentlyAuthenticatedSession: vi.fn(async () => ({})),
        } as never,
        clock: { now: () => scheduledAt },
        journal: {
            recordBlockingIntent,
            recordCommittedDeletion,
            recordCancellation: vi.fn(async () => {}),
        } as AccountDeletionRecoveryJournal,
        preparation: { requestCancellation },
        store: { schedule },
    });
    return {
        recordBlockingIntent,
        recordCommittedDeletion,
        requestCancellation,
        schedule,
        service,
    };
}

describe('AccountDeletionService journal commit boundary', () => {
    it('writes a matching committed marker only after SQL succeeds', async () => {
        const fixture = harness();
        await expect(
            fixture.service.schedule({ userId, sessionId }),
        ).resolves.toMatchObject({ userVersion: 2 });
        expect(fixture.recordBlockingIntent).toHaveBeenCalledWith({
            scheduledAt,
            userId,
            userVersion: 2,
        });
        expect(fixture.recordCommittedDeletion).toHaveBeenCalledWith({
            scheduledAt,
            userId,
            userVersion: 2,
        });
        expect(
            fixture.recordBlockingIntent.mock.invocationCallOrder[0],
        ).toBeLessThan(
            fixture.recordCommittedDeletion.mock.invocationCallOrder[0]!,
        );
        expect(fixture.requestCancellation).toHaveBeenCalledWith(userId);
    });

    it('does not claim a committed marker or start preparation after SQL failure', async () => {
        const fixture = harness();
        fixture.schedule.mockRejectedValueOnce(new Error('SQL failed'));
        await expect(
            fixture.service.schedule({ userId, sessionId }),
        ).rejects.toThrow('SQL failed');
        expect(fixture.recordCommittedDeletion).not.toHaveBeenCalled();
        expect(fixture.requestCancellation).not.toHaveBeenCalled();
    });

    it('fails closed when the post-commit marker is unavailable', async () => {
        const fixture = harness();
        fixture.recordCommittedDeletion.mockRejectedValueOnce(
            new Error('object store offline'),
        );
        await expect(
            fixture.service.schedule({ userId, sessionId }),
        ).rejects.toBeInstanceOf(AccountDeletionJournalUnavailableError);
        expect(fixture.requestCancellation).not.toHaveBeenCalled();
    });
});
