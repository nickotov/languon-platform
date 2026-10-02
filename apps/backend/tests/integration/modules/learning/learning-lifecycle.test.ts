import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import type { FlashcardConfiguration } from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { DrizzleDictionaryStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import {
    LearningConflictError,
    LearningUnavailableError,
} from '../../../../src/modules/learning/domain/errors';
import { DrizzleLearningStore } from '../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-learning-store';
import {
    flashcardAttemptsTable,
    flashcardEntryProgressTable,
    flashcardPreferencesTable,
} from '../../../../src/modules/learning/infrastructure/persistence/drizzle/schema';
import { DrizzleAccountPurgeStore } from '../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { accountDeletionRequestsTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const now = new Date('2026-10-02T12:00:00.000Z');
const configuration: FlashcardConfiguration = {
    front: ['translation'],
    back: ['source'],
};
const context = () => ({ signal: new AbortController().signal });
const dictionaryContext = () => ({ now, signal: new AbortController().signal });

run('flashcard learning lifecycle persistence', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let learning: DrizzleLearningStore;
    let dictionaries: DrizzleDictionaryStore;

    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        learning = new DrizzleLearningStore(database);
        dictionaries = new DrizzleDictionaryStore(database, {
            generate: randomUUID,
        });
    });

    beforeEach(async () => {
        await database.delete(accountDeletionRequestsTable);
        await database.delete(usersTable);
    });

    afterAll(async () => client.end());

    async function createUsers(...ids: string[]) {
        await database.insert(usersTable).values(
            ids.map((id) => ({
                id,
                status: 'active' as const,
                createdAt: now,
                updatedAt: now,
            })),
        );
    }

    async function createDictionary(input: {
        ownerId: string;
        shared?: boolean;
    }) {
        const dictionaryId = randomUUID();
        const cardId = randomUUID();
        const shareLocator = 'abcdefghijklmnopqrstuvwxyz';
        const shareDigest = `hmac-sha256:v1:${'A'.repeat(43)}`;
        await database.insert(dictionariesTable).values({
            id: dictionaryId,
            ownerId: input.ownerId,
            name: 'Learning fixture',
            sourceLanguageTag: 'en',
            targetLanguageTag: 'es',
            createdAt: now,
            updatedAt: now,
            ...(input.shared
                ? {
                      shareKeyDigest: shareDigest,
                      shareKeyRotatedAt: now,
                      shareKeyVersion: 1,
                      shareLocator,
                      visibility: 'unlisted' as const,
                  }
                : {}),
        });
        await database.insert(dictionarySettingsTable).values({
            dictionaryId,
            createdAt: now,
            updatedAt: now,
        });
        await database.insert(dictionaryCardsTable).values({
            id: cardId,
            dictionaryId,
            source: 'hello',
            normalizedSource: 'hello',
            translation: 'hola',
            sortKey: 1024n,
            authorship: 'human',
            createdAt: now,
            updatedAt: now,
        });
        return { cardId, dictionaryId, shareDigest, shareLocator };
    }

    function sharedAccess(input: {
        learnerId: string;
        shareDigest: string;
        shareLocator: string;
    }) {
        return {
            kind: 'shared' as const,
            learnerId: input.learnerId,
            keyDigest: input.shareDigest,
            shareId: input.shareLocator,
        };
    }

    async function rate(input: {
        access:
            | ReturnType<typeof sharedAccess>
            | { kind: 'owner'; dictionaryId: string; learnerId: string };
        cardId: string;
        rating?: 'again' | 'known';
        operationId?: string;
        sessionId?: string;
    }) {
        return learning.recordAttempt(
            input.access,
            {
                configuration,
                entryId: input.cardId,
                expectedLearningVersion: 1,
                operationId: input.operationId ?? randomUUID(),
                rating: input.rating ?? 'known',
                round: 1,
                sessionId: input.sessionId ?? randomUUID(),
            },
            context(),
        );
    }

    it('purges a learner’s preferences, attempts, and progress on a foreign shared dictionary', async () => {
        const ownerId = randomUUID();
        const learnerId = randomUUID();
        await createUsers(ownerId, learnerId);
        const dictionary = await createDictionary({ ownerId, shared: true });
        const access = sharedAccess({ learnerId, ...dictionary });
        await learning.savePreferences(
            access,
            { configuration, expectedVersion: 0, shuffle: false },
            context(),
        );
        await rate({ access, cardId: dictionary.cardId });

        await database
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, learnerId));
        await expect(
            learning.progress(access, context()),
        ).rejects.toBeInstanceOf(LearningUnavailableError);
        await database.insert(accountDeletionRequestsTable).values({
            nextAttemptAt: now,
            purgeAt: now,
            scheduledAt: new Date(now.getTime() - 30 * 24 * 60 * 60_000),
            updatedAt: now,
            userId: learnerId,
        });
        const purge = new DrizzleAccountPurgeStore(database);
        const claim = await purge.claimDue({
            now,
            workerId: 'learning-lifecycle-test',
        });
        expect(claim).toMatchObject({ userId: learnerId });
        expect(
            await purge.finish({
                ...claim!,
                now,
                workerId: 'learning-lifecycle-test',
            }),
        ).toBe(true);

        expect(
            await database
                .select()
                .from(flashcardPreferencesTable)
                .where(eq(flashcardPreferencesTable.learnerId, learnerId)),
        ).toHaveLength(0);
        expect(
            await database
                .select()
                .from(flashcardAttemptsTable)
                .where(eq(flashcardAttemptsTable.learnerId, learnerId)),
        ).toHaveLength(0);
        expect(
            await database
                .select()
                .from(flashcardEntryProgressTable)
                .where(eq(flashcardEntryProgressTable.learnerId, learnerId)),
        ).toHaveLength(0);
        expect(
            await database
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.id, dictionary.dictionaryId)),
        ).toHaveLength(1);
        expect(
            (
                await database
                    .select()
                    .from(usersTable)
                    .where(eq(usersTable.id, learnerId))
            )[0]?.status,
        ).toBe('purged');
    });

    it('does not admit learning after a concurrent account-deletion transaction commits', async () => {
        const ownerId = randomUUID();
        const learnerId = randomUUID();
        await createUsers(ownerId, learnerId);
        const dictionary = await createDictionary({ ownerId, shared: true });
        const access = sharedAccess({ learnerId, ...dictionary });
        let releaseDeletionLock: () => void = () => undefined;
        let markDeletionLockHeld: () => void = () => undefined;
        const deletionLockHeld = new Promise<void>((resolve) => {
            markDeletionLockHeld = resolve;
        });
        const deletionTransaction = client.begin(async (transaction) => {
            await transaction`select id from users where id = ${learnerId} for update`;
            await transaction`update users set status = 'deletion_pending' where id = ${learnerId}`;
            markDeletionLockHeld();
            await new Promise<void>((release) => {
                releaseDeletionLock = release;
            });
        });

        await deletionLockHeld;
        const pending = learning.progress(access, context());
        // Authorization waits for this user lock and must then see the committed
        // deletion-pending status rather than admitting a stale learner.
        await new Promise((resolve) => setTimeout(resolve, 20));
        releaseDeletionLock();
        await deletionTransaction;
        await expect(pending).rejects.toBeInstanceOf(LearningUnavailableError);
    });

    it('cascades every learner’s entry state on permanent card and dictionary deletion', async () => {
        const ownerId = randomUUID();
        const firstLearner = randomUUID();
        const secondLearner = randomUUID();
        await createUsers(ownerId, firstLearner, secondLearner);
        const dictionary = await createDictionary({ ownerId, shared: true });
        await Promise.all(
            [firstLearner, secondLearner].map(async (learnerId) => {
                const access = sharedAccess({ learnerId, ...dictionary });
                await learning.savePreferences(
                    access,
                    { configuration, expectedVersion: 0, shuffle: true },
                    context(),
                );
                await rate({ access, cardId: dictionary.cardId });
            }),
        );
        await database
            .delete(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, dictionary.cardId));
        expect(
            await database.select().from(flashcardAttemptsTable),
        ).toHaveLength(0);
        expect(
            await database.select().from(flashcardEntryProgressTable),
        ).toHaveLength(0);
        expect(
            await database.select().from(flashcardPreferencesTable),
        ).toHaveLength(2);

        await database
            .delete(dictionariesTable)
            .where(eq(dictionariesTable.id, dictionary.dictionaryId));
        expect(
            await database.select().from(flashcardPreferencesTable),
        ).toHaveLength(0);
    });

    it('excludes archived cards from totals, restores their current progress, and does not copy it into a fork', async () => {
        const ownerId = randomUUID();
        const forkOwnerId = randomUUID();
        await createUsers(ownerId, forkOwnerId);
        const dictionary = await createDictionary({ ownerId, shared: true });
        const ownerAccess = {
            kind: 'owner' as const,
            dictionaryId: dictionary.dictionaryId,
            learnerId: ownerId,
        };
        await rate({ access: ownerAccess, cardId: dictionary.cardId });
        expect(await learning.progress(ownerAccess, context())).toEqual({
            total: 1,
            known: 1,
            again: 0,
            unstudied: 0,
        });

        const archived = await dictionaries.archiveCard({
            cardId: dictionary.cardId,
            context: dictionaryContext(),
            dictionaryId: dictionary.dictionaryId,
            ownerId,
            request: { expectedCardVersion: 1, expectedDictionaryVersion: 1 },
        });
        expect(await learning.progress(ownerAccess, context())).toEqual({
            total: 0,
            known: 0,
            again: 0,
            unstudied: 0,
        });
        await dictionaries.restoreCard({
            cardId: dictionary.cardId,
            context: dictionaryContext(),
            dictionaryId: dictionary.dictionaryId,
            ownerId,
            request: {
                expectedCardVersion: archived.card.version,
                expectedDictionaryVersion: archived.dictionaryVersion,
            },
        });
        expect(await learning.progress(ownerAccess, context())).toEqual({
            total: 1,
            known: 1,
            again: 0,
            unstudied: 0,
        });

        const fork = await dictionaries.forkSharedDictionary({
            context: dictionaryContext(),
            fingerprint: `hmac-sha256:v1:${'B'.repeat(43)}`,
            idempotencyKey: randomUUID(),
            ownerId: forkOwnerId,
            request: { name: 'Independent learning fork' },
            sourceDictionaryId: dictionary.dictionaryId,
            verifiedShareDigest: dictionary.shareDigest,
        });
        const [forkCard] = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.dictionaryId, fork.id));
        expect(forkCard?.id).not.toBe(dictionary.cardId);
        expect(
            await database
                .select()
                .from(flashcardAttemptsTable)
                .where(eq(flashcardAttemptsTable.dictionaryId, fork.id)),
        ).toHaveLength(0);
        expect(
            await learning.progress(
                {
                    kind: 'owner',
                    dictionaryId: fork.id,
                    learnerId: forkOwnerId,
                },
                context(),
            ),
        ).toEqual({ total: 1, known: 0, again: 0, unstudied: 1 });
    });

    it('serializes duplicate ratings and rejects an undo after a learning-content edit', async () => {
        const ownerId = randomUUID();
        await createUsers(ownerId);
        const dictionary = await createDictionary({ ownerId });
        const access = {
            kind: 'owner' as const,
            dictionaryId: dictionary.dictionaryId,
            learnerId: ownerId,
        };
        const operationId = randomUUID();
        const sessionId = randomUUID();
        const [first, replay] = await Promise.all([
            rate({ access, cardId: dictionary.cardId, operationId, sessionId }),
            rate({ access, cardId: dictionary.cardId, operationId, sessionId }),
        ]);
        expect(replay).toEqual(first);
        expect(
            await database.select().from(flashcardAttemptsTable),
        ).toHaveLength(1);

        const changed = await dictionaries.updateCard({
            cardId: dictionary.cardId,
            context: dictionaryContext(),
            dictionaryId: dictionary.dictionaryId,
            ownerId,
            request: {
                expectedCardVersion: 1,
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                values: { source: 'greetings' },
            },
        });
        expect(changed.card.version).toBe(2);
        try {
            await learning.undo(
                access,
                first.attemptId,
                { operationId: randomUUID() },
                context(),
            );
            throw new Error('Expected stale learning content to reject undo.');
        } catch (error) {
            expect(error).toBeInstanceOf(LearningConflictError);
            expect(error).toMatchObject({ reason: 'stale_content' });
        }
        expect(
            await database
                .select()
                .from(flashcardEntryProgressTable)
                .where(
                    and(
                        eq(flashcardEntryProgressTable.learnerId, ownerId),
                        eq(
                            flashcardEntryProgressTable.entryId,
                            dictionary.cardId,
                        ),
                    ),
                ),
        ).toHaveLength(1);
    });
});
