import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { KnowledgeNoteContentSchema } from '@languon/contracts';
import { eq } from 'drizzle-orm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
const testShareSecret = 'knowledge-workspace-test-secret-47';
import {
    DrizzleKnowledgeTransactionParticipant,
    type KnowledgeDatabase,
} from './knowledge-transaction';
import {
    knowledgeNotesTable,
    knowledgeNoteRevisionsTable,
    knowledgeOperationReceiptsTable,
    knowledgeSharesTable,
} from './schema';
import {
    eraseOwnerKnowledge,
    hasOwnerKnowledge,
} from './knowledge-deletion-participant';
import { KnowledgeDomainError } from '../../../domain/knowledge';

const content = KnowledgeNoteContentSchema.parse({
    title: 'Subjunctive',
    summary: 'Express uncertainty.',
    categories: ['grammar'],
    studiedLanguage: 'es',
    explanationLanguage: 'en',
    body: {
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Ojalá llueva mañana.' }],
                },
            ],
        },
    },
});
describe.runIf(isDatabaseIntegrationEnabled())(
    'Knowledge PostgreSQL ownership, revisions and publication',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let store: DrizzleKnowledgeStore;
        let owner: string;
        let other: string;
        const beforeNoteDeletion = vi.fn(async () => {});
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            store = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion },
                new KnowledgeShareCrypto(testShareSecret),
            );
        }, 120_000);
        beforeEach(async () => {
            beforeNoteDeletion.mockReset();
            await db.delete(knowledgeNotesTable);
            await db.delete(knowledgeOperationReceiptsTable);
            await db.delete(usersTable);
            owner = randomUUID();
            other = randomUUID();
            await db.insert(usersTable).values(
                [owner, other].map((id) => ({
                    id,
                    status: 'active' as const,
                })),
            );
        });
        afterAll(async () => client?.end(), 120_000);
        it('isolates reads and mutations and searches derived content with literal wildcard escaping', async () => {
            const note = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            await expect(store.get(other, note.id)).rejects.toMatchObject({
                code: 'knowledge_not_found',
            });
            await expect(
                store.update(other, note.id, {
                    operationId: randomUUID(),
                    expectedVersion: 1,
                    content,
                }),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            expect(
                (
                    await store.list(owner, {
                        q: 'llueva',
                        offset: 0,
                        limit: 20,
                    })
                ).notes.map((n) => n.id),
            ).toEqual([note.id]);
            expect(
                (await store.list(other, { offset: 0, limit: 20 })).notes,
            ).toEqual([]);
            expect(
                (await store.listWorkspaces(owner, { offset: 0, limit: 20 }))
                    .workspaces[0]?.hasUnsavedChanges,
            ).toBe(false);
            expect(
                (await store.list(owner, { q: '%', offset: 0, limit: 20 }))
                    .notes,
            ).toEqual([]);
            expect(
                (
                    await store.list(owner, {
                        category: 'culture',
                        offset: 0,
                        limit: 20,
                    })
                ).notes,
            ).toEqual([]);
        });
        it('accepts only one concurrent update and restores content as a fresh immutable revision', async () => {
            const note = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const updates = await Promise.allSettled(
                ['First', 'Second'].map((title) =>
                    store.update(owner, note.id, {
                        operationId: randomUUID(),
                        expectedVersion: 1,
                        content: { ...content, title },
                    }),
                ),
            );
            expect(
                updates.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(
                updates.filter((result) => result.status === 'rejected'),
            ).toHaveLength(1);
            const current = await store.get(owner, note.id);
            expect(current.version).toBe(2);
            const restored = await store.restore(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 2,
                revisionVersion: 1,
            });
            expect(restored).toMatchObject({
                title: content.title,
                version: 3,
            });
            expect(
                (await store.revisions(owner, note.id)).map(
                    (revision) => revision.version,
                ),
            ).toEqual([3, 2, 1]);
        });
        it('preserves an unsaved working draft across revision restore and allows explicit resolution before Save', async () => {
            const note = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            await store.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: { ...content, title: 'Published v2' },
            });
            const initial = await store.getWorkspace(owner, note.id);
            const branch = initial.branches[0]!;
            const working = await store.updateWorking(owner, note.id, {
                operationId: randomUUID(),
                branchId: branch.id,
                expectedVersion: branch.version,
                content: { ...content, title: 'Unsaved essay' },
            });
            const restored = await store.restore(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 2,
                revisionVersion: 1,
            });
            expect(restored.version).toBe(3);
            const conflicted = await store.getWorkspace(owner, note.id);
            expect(conflicted.preferredBranchId).toBe(working.branch.id);
            expect(
                conflicted.branches
                    .map((branch) => branch.content.title)
                    .sort(),
            ).toEqual(['Subjunctive', 'Unsaved essay']);
            const publishedBranch = conflicted.branches.find(
                (branch) => branch.id !== working.branch.id,
            )!;
            expect(publishedBranch.basePublishedVersion).toBe(3);
            await expect(
                store.saveWorkspace(owner, note.id, {
                    operationId: randomUUID(),
                    branchId: working.branch.id,
                    expectedVersion: working.branch.version,
                    expectedPublishedVersion: 3,
                }),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            const resolved = await store.resolveWorking(owner, note.id, {
                operationId: randomUUID(),
                keepBranchId: working.branch.id,
                keepVersion: working.branch.version,
                discardBranches: [
                    {
                        id: publishedBranch.id,
                        expectedVersion: publishedBranch.version,
                    },
                ],
            });
            expect(resolved.branches).toHaveLength(1);
            expect(resolved.branches[0]).toMatchObject({
                id: working.branch.id,
                version: working.branch.version + 1,
                basePublishedVersion: 3,
            });
            const saved = await store.saveWorkspace(owner, note.id, {
                operationId: randomUUID(),
                branchId: working.branch.id,
                expectedVersion: resolved.branches[0]!.version,
                expectedPublishedVersion: 3,
            });
            expect(saved).toMatchObject({ version: 4, title: 'Unsaved essay' });
            expect(
                (await store.revisions(owner, note.id)).map(
                    (revision) => revision.version,
                ),
            ).toEqual([4, 3, 2, 1]);
        });
        it('replays successful requests without duplicate notes or revisions and rejects changed reuse', async () => {
            const input = { operationId: randomUUID(), content };
            const [left, right] = await Promise.all([
                store.create(owner, input),
                store.create(owner, input),
            ]);
            expect(left).toEqual(right);
            expect(
                (await store.list(owner, { offset: 0, limit: 20 })).total,
            ).toBe(1);
            await expect(
                store.create(owner, {
                    ...input,
                    content: { ...content, title: 'Changed' },
                }),
            ).rejects.toMatchObject({ code: 'idempotency_conflict' });
            const patch = {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: { ...content, title: 'A revision' },
            };
            const updated = await store.update(owner, left.id, patch);
            await store.update(owner, left.id, {
                operationId: randomUUID(),
                expectedVersion: 2,
                content: { ...content, title: 'Newer revision' },
            });
            expect(await store.update(owner, left.id, patch)).toEqual(updated);
        });
        it('deletes revisions and prevents old creates or pending update drafts from resurrecting notes', async () => {
            const input = { operationId: randomUUID(), content };
            const note = await store.create(owner, input);
            const deletion = { operationId: randomUUID(), expectedVersion: 1 };
            await store.delete(owner, note.id, deletion);
            await store.delete(owner, note.id, deletion);
            expect(beforeNoteDeletion).toHaveBeenCalledOnce();
            expect(
                await db
                    .select()
                    .from(knowledgeNoteRevisionsTable)
                    .where(eq(knowledgeNoteRevisionsTable.noteId, note.id)),
            ).toEqual([]);
            await expect(store.create(owner, input)).rejects.toMatchObject({
                code: 'knowledge_not_found',
            });
            await expect(
                db.transaction((tx) =>
                    new DrizzleKnowledgeTransactionParticipant(tx).publish(
                        owner,
                        {
                            operationId: randomUUID(),
                            noteId: note.id,
                            expectedVersion: 1,
                            content,
                        },
                    ),
                ),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
        });
        it('rolls back explicit publication together with a failed conversation draft transaction', async () => {
            await expect(
                db.transaction(async (tx) => {
                    await new DrizzleKnowledgeTransactionParticipant(
                        tx,
                    ).publish(owner, { operationId: randomUUID(), content });
                    throw new Error('draft version fence failed');
                }),
            ).rejects.toThrow('draft version fence failed');
            expect(
                (await store.list(owner, { offset: 0, limit: 20 })).notes,
            ).toEqual([]);
            expect(
                await db.select().from(knowledgeOperationReceiptsTable),
            ).toEqual([]);
        });
        it('preserves the note and receipt when source-dependent work blocks deletion', async () => {
            const note = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            beforeNoteDeletion.mockRejectedValueOnce(
                new KnowledgeDomainError(
                    'deletion_busy',
                    'Stop the active turn first.',
                ),
            );
            await expect(
                store.delete(owner, note.id, {
                    operationId: randomUUID(),
                    expectedVersion: 1,
                }),
            ).rejects.toMatchObject({ code: 'deletion_busy' });
            expect((await store.get(owner, note.id)).version).toBe(1);
            expect(
                await db.select().from(knowledgeOperationReceiptsTable),
            ).toHaveLength(1);
        });
        it('account purge erases owned notes, revisions and receipts without deleting other learners notes', async () => {
            await store.create(owner, { operationId: randomUUID(), content });
            const otherNote = await store.create(other, {
                operationId: randomUUID(),
                content,
            });
            await db.transaction((tx) => eraseOwnerKnowledge(tx, owner));
            expect(
                await db.transaction((tx) => hasOwnerKnowledge(tx, owner)),
            ).toBe(false);
            expect(await store.get(other, otherNote.id)).toMatchObject({
                id: otherNote.id,
            });
        });
        it('recovers a private draft, preserves a competing branch, and publishes only an explicit Save', async () => {
            const workspace = await store.createDraft(owner, {
                operationId: randomUUID(),
            });
            expect(workspace.status).toBe('draft');
            expect(workspace.published).toBeNull();
            await expect(
                store.get(owner, workspace.noteId),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            const original = workspace.branches[0]!;
            const firstAutosave = {
                operationId: randomUUID(),
                branchId: original.id,
                expectedVersion: 1,
                content,
            };
            const first = await store.updateWorking(
                owner,
                workspace.noteId,
                firstAutosave,
            );
            expect(first.conflict).toBe(false);
            expect(
                await store.updateWorking(
                    owner,
                    workspace.noteId,
                    firstAutosave,
                ),
            ).toEqual(first);
            const competing = await store.updateWorking(
                owner,
                workspace.noteId,
                {
                    operationId: randomUUID(),
                    branchId: original.id,
                    expectedVersion: 1,
                    content: { ...content, title: 'Competing text' },
                },
            );
            expect(competing.conflict).toBe(true);
            expect(competing.branches).toHaveLength(2);
            await expect(
                store.resolveWorking(owner, workspace.noteId, {
                    operationId: randomUUID(),
                    keepBranchId: competing.branch.id,
                    keepVersion: competing.branch.version,
                    discardBranches: [
                        {
                            id: first.branch.id,
                            expectedVersion: first.branch.version + 1,
                        },
                    ],
                }),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            expect(
                (await store.getWorkspace(owner, workspace.noteId)).branches,
            ).toHaveLength(2);
            const resolved = await store.resolveWorking(
                owner,
                workspace.noteId,
                {
                    operationId: randomUUID(),
                    keepBranchId: competing.branch.id,
                    keepVersion: competing.branch.version,
                    discardBranches: [
                        {
                            id: first.branch.id,
                            expectedVersion: first.branch.version,
                        },
                    ],
                },
            );
            expect(resolved.branches).toHaveLength(1);
            const draft = await store.getWorkspace(owner, workspace.noteId);
            expect(draft.published).toBeNull();
            const saved = await store.saveWorkspace(owner, workspace.noteId, {
                operationId: randomUUID(),
                branchId: competing.branch.id,
                expectedVersion: competing.branch.version,
                expectedPublishedVersion: 0,
            });
            expect(saved.id).toBe(workspace.noteId);
            expect(saved.title).toBe('Competing text');
            expect(
                (await store.getWorkspace(owner, saved.id)).branches,
            ).toHaveLength(1);
        });
        it('shares only the saved version, revokes old capabilities and keeps recipient copies independent', async () => {
            const note = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const share = await store.issueShare(owner, note.id);
            expect(await store.getShare(owner, note.id)).toEqual(share);
            expect(
                (await store.readShared(share.locator, share.key)).title,
            ).toBe(content.title);
            await expect(
                store.readShared(share.locator, 'x'.repeat(43)),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            const copy = await store.copyShared(
                other,
                share.locator,
                share.key,
                { operationId: randomUUID(), expectedVersion: 1 },
            );
            expect(copy.id).not.toBe(note.id);
            await store.revokeShare(owner, note.id);
            await expect(
                store.readShared(share.locator, share.key),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            const renewed = await store.issueShare(owner, note.id);
            expect(renewed.locator).not.toBe(share.locator);
            expect((await store.get(other, copy.id)).title).toBe(content.title);
        });
        it('rejects a shared read that observed the key before revocation committed', async () => {
            let observed!: () => void;
            const observedFirstCheck = new Promise<void>((resolve) => {
                observed = resolve;
            });
            class ObservedCrypto extends KnowledgeShareCrypto {
                override verify(key: string, digest: string | null) {
                    observed();
                    return super.verify(key, digest);
                }
            }
            const observedStore = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion },
                new ObservedCrypto(testShareSecret),
            );
            const note = await observedStore.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const share = await observedStore.issueShare(owner, note.id);
            let release!: () => void;
            const releaseRevocation = new Promise<void>((resolve) => {
                release = resolve;
            });
            let noteLocked!: () => void;
            const locked = new Promise<void>((resolve) => {
                noteLocked = resolve;
            });
            const revoke = db.transaction(async (tx) => {
                await tx
                    .select()
                    .from(knowledgeNotesTable)
                    .where(eq(knowledgeNotesTable.id, note.id))
                    .for('update');
                noteLocked();
                await releaseRevocation;
                await tx
                    .delete(knowledgeSharesTable)
                    .where(eq(knowledgeSharesTable.noteId, note.id));
            });
            await locked;
            const read = observedStore.readShared(share.locator, share.key);
            const rejectedRead = expect(read).rejects.toMatchObject({
                code: 'knowledge_not_found',
            });
            await observedFirstCheck;
            release();
            await revoke;
            await rejectedRead;
        });
        it('recovers an empty working title and rejects publication until title and body are present', async () => {
            const workspace = await store.createDraft(owner, {
                operationId: randomUUID(),
            });
            const branch = workspace.branches[0]!;
            const blank = await store.updateWorking(owner, workspace.noteId, {
                operationId: randomUUID(),
                branchId: branch.id,
                expectedVersion: branch.version,
                content: { ...branch.content, title: '' },
            });
            expect(
                (await store.getWorkspace(owner, workspace.noteId)).branches[0]
                    ?.content.title,
            ).toBe('');
            await expect(
                store.saveWorkspace(owner, workspace.noteId, {
                    operationId: randomUUID(),
                    branchId: blank.branch.id,
                    expectedVersion: blank.branch.version,
                    expectedPublishedVersion: 0,
                }),
            ).rejects.toMatchObject({ code: 'invalid_request' });
            const valid = await store.updateWorking(owner, workspace.noteId, {
                operationId: randomUUID(),
                branchId: blank.branch.id,
                expectedVersion: blank.branch.version,
                content,
            });
            expect(
                (
                    await store.saveWorkspace(owner, workspace.noteId, {
                        operationId: randomUUID(),
                        branchId: valid.branch.id,
                        expectedVersion: valid.branch.version,
                        expectedPublishedVersion: 0,
                    })
                ).title,
            ).toBe(content.title);
        });
        it('names an untouched draft once from the first message and preserves manual names', async () => {
            const first = await store.createDraft(owner, {
                operationId: randomUUID(),
            });
            await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(
                    tx,
                ).nameUntitledFromFirstMessage(
                    owner,
                    first.noteId,
                    'How do articles',
                ),
            );
            await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(
                    tx,
                ).nameUntitledFromFirstMessage(
                    owner,
                    first.noteId,
                    'Later message title',
                ),
            );
            expect(
                (await store.getWorkspace(owner, first.noteId)).branches[0]
                    ?.content.title,
            ).toBe('How do articles');
            const second = await store.createDraft(owner, {
                operationId: randomUUID(),
            });
            const branch = second.branches[0]!;
            await store.updateWorking(owner, second.noteId, {
                operationId: randomUUID(),
                branchId: branch.id,
                expectedVersion: 1,
                content: { ...branch.content, title: 'My essay' },
            });
            await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(
                    tx,
                ).nameUntitledFromFirstMessage(
                    owner,
                    second.noteId,
                    'Ignored title',
                ),
            );
            expect(
                (await store.getWorkspace(owner, second.noteId)).branches[0]
                    ?.content.title,
            ).toBe('My essay');
        });
    },
);
