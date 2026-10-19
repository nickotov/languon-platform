import { describe, expect, it, vi } from 'vitest';
import type { TextAlignment } from '@languon/contracts';
import { CopiedAttachmentSchema } from '@languon/contracts';
import {
    ConversationWorkerService,
    type ConversationWorkerStore,
} from '../../../../src/modules/conversations/application/conversation-worker-service';
import { projectConversationSource } from '../../../../src/modules/conversations/application/conversation-source-context';
import {
    assertTutorCurrentMessageFits,
    currentTutorMessageByteLimit,
    projectTutorUserMessage,
    tutorCurrentMessageBytes,
} from '../../../../src/modules/conversations/application/tutor-message-context';
import type { ClaimedConversationTurn } from '../../../../src/modules/conversations/application/ports/conversation-store';
import type { TutorRunInput } from '../../../../src/modules/conversations/application/ports/tutor-runner';
import { textSourceMaterial } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source-material';
import {
    createContextualTutorRunner,
    tutorMemoryThresholds,
} from '../../../../src/modules/conversations/infrastructure/ai/contextual-tutor-runner';
import {
    scriptedTutorModel,
    tutorAccountingFixture,
    tutorMemoryFixture,
} from '../../../../src/modules/conversations/infrastructure/ai/tutor-test-fixtures';

const id = '00000000-0000-4000-8000-000000000001';
const bytes = (value: unknown) =>
    Buffer.byteLength(JSON.stringify(value), 'utf8');

function longTurn(): ClaimedConversationTurn {
    const source = Array.from({ length: 80 }, (_, index) => ({
        pairId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        text: `Source passage ${index}: ${index === 76 ? 'zafiro' : 'casa'} ${'Una explicación del lenguaje. '.repeat(40)}`,
        startOffset: index * 1000,
        endOffset: index * 1000 + 999,
        paragraphIndex: index,
    }));
    const alignment: TextAlignment = {
        source,
        translation: source.map((item, index) => ({
            pairId: item.pairId,
            text: `Translation ${index}: ${index === 76 ? 'sapphire' : 'house'} ${'An explanation about language. '.repeat(40)}`,
        })),
        editedPairIds: [],
    };
    return {
        id,
        conversationId: id,
        ownerId: id,
        leaseToken: 'lease-1',
        authority: { sourceOwnerId: id },
        execution: {},
        conversationCreatedAt: '2026-10-19T00:00:00.000Z',
        source: { kind: 'text', id },
        preferences: {
            replyLanguage: 'auto',
            tone: 'neutral',
            explanationLevel: 'auto',
        },
        message: {
            id: '00000000-0000-4000-8000-000000000002',
            role: 'user',
            content: 'Explain zafiro in the passage near the end.',
            createdAt: '2026-10-19T00:10:00.000Z',
        },
        sourceSnapshot: {
            version: '1',
            title: 'A long translated saved text',
            description: null,
            studiedLanguage: 'es',
            provenance: 'saved',
            scope: 'complete',
            material: textSourceMaterial({
                id,
                version: '1',
                title: 'A long translated saved text',
                sourceText: source.map((item) => item.text).join('\n'),
                sourceLanguage: 'es',
                targetLanguage: 'en',
                alignment,
            }),
        },
    };
}

function fixture(turn = longTurn()) {
    const memory = tutorMemoryFixture([turn.message]);
    const store: ConversationWorkerStore = {
        claim: vi.fn(async () => turn),
        heartbeat: vi.fn(async () => undefined),
        append: vi.fn(async () => undefined),
        recordTool: vi.fn(async () => undefined),
        recordMaterial: vi.fn(async () => undefined),
        finish: vi.fn(async () => undefined),
        memory: () => memory.port,
        propose: vi.fn(async () => {
            throw new Error('Unexpected note proposal.');
        }),
    };
    return { turn, memory, store };
}

describe('conversation worker bounded source context', () => {
    it('keeps a near-limit escaped Unicode question and copies whole through real SDK retrieval and compaction', async () => {
        const turn = longTurn();
        turn.conversationCreatedAt = new Date(
            Date.now() - 120_000,
        ).toISOString();
        turn.message.createdAt = new Date().toISOString();
        turn.message.content =
            'Explain "zafiro" 👋\\\n in the passage near the end.';
        const project = (length: number) => {
            const attachments = [0, 1].map((index) => ({
                id: `00000000-0000-4000-8000-00000000000${index + 3}`,
                label: `Copied passage ${index}`,
                content: 'مثال 👋 \\"\n'.repeat(length),
            }));
            return {
                attachments,
                modelContent: projectTutorUserMessage({
                    content: turn.message.content,
                    attachments,
                    source: {
                        sourceKind: 'text',
                        version: turn.sourceSnapshot.version,
                        provenance: 'saved',
                        title: turn.sourceSnapshot.title,
                        studiedLanguage: 'es',
                    },
                }),
            };
        };
        let length = 1;
        while (
            tutorCurrentMessageBytes(project(length + 1).modelContent) <=
            currentTutorMessageByteLimit
        )
            length++;
        const original = project(length);
        turn.message = { ...turn.message, ...original };
        expect(tutorCurrentMessageBytes(original.modelContent)).toBeGreaterThan(
            7_900,
        );
        assertTutorCurrentMessageFits(original.modelContent);
        const { store, memory } = fixture(turn);
        memory.messages.set('old-history', {
            id: 'old-history',
            role: 'assistant',
            content:
                'Earlier language examples about articles and grammar. '.repeat(
                    300,
                ),
            createdAt: new Date(Date.now() - 60_000).toISOString(),
        });
        const observations =
            '<observations>\n- The learner supplied two exact copied passages with Arabic, emoji, quotes, backslashes and newlines, and asks about zafiro. Current source translation uses sapphire.\n</observations>';
        const provider = scriptedTutorModel([
            observations,
            {
                toolName: 'read_source_context',
                input: { query: 'zafiro', limit: 10 },
            },
            observations,
            'Zafiro means sapphire in this context.',
        ]);
        const accounting = tutorAccountingFixture();
        let runnerError: unknown;
        const worker = new ConversationWorkerService({
            store,
            createRunner: () => {
                const runner = createContextualTutorRunner({
                    model: provider.model,
                    accounting,
                    maxInputTokens: 64_000,
                });
                return {
                    run: async (input) => {
                        expect(
                            bytes(JSON.stringify(input.sourceContext)),
                        ).toBeLessThanOrEqual(12_000);
                        try {
                            return await runner.run(input);
                        } catch (error) {
                            runnerError = error;
                            throw error;
                        }
                    },
                };
            },
        });
        await worker.processNext(new AbortController().signal);
        expect(runnerError).toBeUndefined();
        expect(store.finish).toHaveBeenCalledExactlyOnceWith(turn, 'succeeded');
        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['observation', 'answer', 'observation', 'answer']);
        expect(accounting.settle).toHaveBeenCalledTimes(4);
        expect(accounting.fail).not.toHaveBeenCalled();
        const retrieved =
            vi.mocked(store.recordMaterial).mock.calls[0]?.[1] ?? [];
        expect(bytes(retrieved)).toBeGreaterThan(20_000);
        expect(bytes(retrieved)).toBeLessThanOrEqual(24_000);
        for (const [call] of accounting.admit.mock.calls)
            expect(call.inputTokenEstimate).toBeLessThanOrEqual(64_000);
        expect(memory.messages.get(turn.message.id)?.attachments).toEqual(
            original.attachments,
        );
        expect(memory.messages.get(turn.message.id)?.content).toBe(
            turn.message.content,
        );
        expect(JSON.stringify(provider.requests.at(-1)?.prompt)).toContain(
            'sapphire',
        );
    });
    it('uses relevant bounded context for a translated text over 80k and retrieves surrounding frozen passages', async () => {
        const { turn, store } = fixture();
        const original = structuredClone(turn.sourceSnapshot);
        expect(bytes(original)).toBeGreaterThan(80_000);
        let input!: TutorRunInput;
        const worker = new ConversationWorkerService({
            store,
            createRunner: () => ({
                run: async (next) => {
                    input = next;
                    expect(bytes(next.sourceContext)).toBeLessThanOrEqual(
                        12_000,
                    );
                    expect(next.sourceContext).toMatchObject({
                        scope: 'partial',
                        snapshotScope: 'complete',
                        availableMaterialCount: original.material.length,
                    });
                    expect(JSON.stringify(next.sourceContext)).toContain(
                        'zafiro',
                    );
                    const selected = await next.readContext({
                        query: 'zafiro',
                        limit: 3,
                    });
                    const target = original.material.findIndex((item) =>
                        item.content.includes('zafiro'),
                    );
                    expect(selected.material.map((item) => item.id)).toEqual(
                        original.material
                            .slice(target - 1, target + 2)
                            .map((item) => item.id),
                    );
                    expect(JSON.stringify(selected.material)).toContain(
                        'sapphire',
                    );
                    expect(selected.total).toBe(original.material.length);
                    expect(bytes(selected)).toBeLessThanOrEqual(24_000);
                    expect(
                        store.recordMaterial,
                    ).toHaveBeenCalledExactlyOnceWith(turn, selected.material);
                    return { text: 'Zafiro means sapphire.' };
                },
            }),
        });
        await expect(
            worker.processNext(new AbortController().signal),
        ).resolves.toBe(true);
        expect(input).toBeDefined();
        expect(turn.sourceSnapshot).toEqual(original);
        expect(store.finish).toHaveBeenCalledExactlyOnceWith(turn, 'succeeded');
    });

    it('runs that long source through real SDK native retrieval without crossing the 64k dispatch budget', async () => {
        const { turn, store } = fixture();
        const provider = scriptedTutorModel([
            {
                toolName: 'read_source_context',
                input: { query: 'zafiro', limit: 3 },
            },
            '<observations>\n- The learner asks about zafiro in passage 77. The frozen Spanish source and English translation use zafiro and sapphire; surrounding passages provide context.\n</observations>',
            'Zafiro means sapphire in the quoted passage.',
        ]);
        const accounting = tutorAccountingFixture();
        let runnerError: unknown;
        const worker = new ConversationWorkerService({
            store,
            createRunner: () => {
                const runner = createContextualTutorRunner({
                    model: provider.model,
                    accounting,
                    maxInputTokens: 64_000,
                });
                return {
                    run: async (input) => {
                        try {
                            return await runner.run(input);
                        } catch (error) {
                            runnerError = error;
                            throw error;
                        }
                    },
                };
            },
        });
        await worker.processNext(new AbortController().signal);
        expect(runnerError).toBeUndefined();
        expect(store.finish).toHaveBeenCalledExactlyOnceWith(turn, 'succeeded');
        expect(provider.requests).toHaveLength(3);
        expect(JSON.stringify(provider.requests.at(-1)?.prompt)).toContain(
            'sapphire',
        );
        expect(JSON.stringify(provider.requests.at(-1)?.prompt)).toContain(
            'partial',
        );
        for (const [call] of accounting.admit.mock.calls)
            expect(call.inputTokenEstimate).toBeLessThanOrEqual(64_000);
        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['answer', 'observation', 'answer']);
        expect(accounting.settle).toHaveBeenCalledTimes(3);
        expect(accounting.fail).not.toHaveBeenCalled();
    });

    it('preserves all oversized unsaved draft text in safe Unicode excerpts and reports partial coverage', () => {
        const { turn } = fixture();
        const content = 'مثال 👋 \\"\n'.repeat(5_000) + ' zafiro نهاية';
        const snapshot = {
            ...turn.sourceSnapshot,
            provenance: 'draft' as const,
            scope: 'selected-material' as const,
            material: [{ id, label: 'An explicit unsaved draft', content }],
        };
        const projection = projectConversationSource(
            'text',
            snapshot,
            'Explain zafiro',
        );
        expect(bytes(projection.initialContext)).toBeLessThanOrEqual(12_000);
        expect(projection.initialContext).toMatchObject({
            provenance: 'draft',
            scope: 'partial',
            snapshotScope: 'selected-material',
        });
        const selected = projection.read({ query: 'zafiro', limit: 3 });
        expect(JSON.stringify(selected)).toContain('zafiro');
        expect(bytes(selected)).toBeLessThanOrEqual(24_000);
        for (const item of selected.material)
            CopiedAttachmentSchema.parse(item);
        expect(snapshot.material[0]?.content).toBe(content);
    });

    it('keeps dictionary content behind source tools and marks a selected-source snapshot as partial', () => {
        const { turn } = fixture();
        const projection = projectConversationSource(
            'dictionary',
            turn.sourceSnapshot,
            'zafiro',
        );
        expect(projection.initialContext).not.toHaveProperty('material');
        expect(projection.initialContext).toMatchObject({
            scope: 'partial',
            includedMaterialCount: 0,
            availableMaterialCount: turn.sourceSnapshot.material.length,
        });
        expect(
            JSON.stringify(projection.read({ query: 'zafiro', limit: 1 })),
        ).toContain('zafiro');
    });

    it('reduces memory thresholds when source and tool responses consume the conservative byte budget', () => {
        expect(tutorMemoryThresholds(64_000, 40_000)).toEqual({
            messageTokens: 3_000,
            observationTokens: 1_500,
            maxTokensPerBatch: 3_000,
        });
        expect(
            tutorMemoryThresholds(128_000, 40_000).messageTokens,
        ).toBeLessThan(16_000);
        expect(() => tutorMemoryThresholds(64_000, 63_000)).toThrow(
            'insufficient context',
        );
    });
});
