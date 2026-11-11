import { resolveModelConfig } from '@mastra/core/llm';
import {
    createTutorMemory,
    requireSupportedTutorModel,
} from './contextual-tutor-configuration';
import { createTutorModelGate } from './accounted-tutor-model';
import { tutorAccountingFixture } from './tutor-test-fixtures';
import { describe, expect, it, vi } from 'vitest';
import {
    ConversationMemoryStorage,
    toTutorModelMessage,
} from './conversation-memory-storage.js';
import { tutorMemoryFixture } from './tutor-test-fixtures.js';
import { projectTutorUserMessage } from '../../application/tutor-message-context.js';

function fixture() {
    const memory = tutorMemoryFixture([
        {
            id: 'admitted-user',
            role: 'user',
            content: 'Explain casa.',
            createdAt: '2026-10-19T00:00:00.000Z',
            attachments: [
                { id: 'copy-1', label: 'Copied card', content: 'la casa' },
            ],
        },
    ]);
    const storage = new ConversationMemoryStorage({
        conversationId: 'conversation-1',
        ownerId: 'owner-1',
        createdAt: '2026-10-19T00:00:00.000Z',
        port: memory.port,
    });

    return { memory, storage };
}

describe('conversation-bound Mastra memory storage', () => {
    it('retains the entire admitted user envelope despite SDK text, editor and provenance rewrites', async () => {
        const { memory, storage } = fixture();
        const saving = vi.spyOn(memory.port, 'saveMessages');
        const original = memory.messages.get('admitted-user')!;
        original.modelContent = projectTutorUserMessage({
            content: original.content,
            editorContext: { content: 'Admitted exact editor copy.' },
        });

        const before = structuredClone(original);
        await storage.saveMessages({
            messages: [
                toTutorModelMessage(
                    {
                        ...original,
                        modelContent: {
                            format: 2,
                            parts: [
                                { type: 'text', text: original.content },
                                {
                                    type: 'text',
                                    text: 'FORGED_EDITOR_AND_PROVENANCE',
                                },
                            ],
                            metadata: { mastra: { observed: true } },
                        },
                    },
                    'conversation-1',
                    'owner-1',
                ),
            ],
        });

        expect(saving).not.toHaveBeenCalled();
        expect(memory.messages.get('admitted-user')).toEqual(before);
    });

    it('keeps historical assistant tool arguments immutable while persisting newly emitted response parts', async () => {
        const { memory, storage } = fixture();
        const original = {
            id: 'old-assistant',
            role: 'assistant' as const,
            content: 'Saved reply.',
            createdAt: '2026-10-18T00:00:00.000Z',
            modelContent: {
                format: 2,
                parts: [
                    {
                        type: 'text',
                        text: 'Original tool arguments and result.',
                    },
                ],
            },
        };

        memory.messages.set(original.id, original);
        const before = structuredClone(original);
        await storage.saveMessages({
            messages: [
                toTutorModelMessage(
                    {
                        ...original,
                        modelContent: {
                            format: 2,
                            parts: [
                                { type: 'text', text: 'FORGED_TOOL_ARGUMENTS' },
                            ],
                        },
                    },
                    'conversation-1',
                    'owner-1',
                ),
            ],
        });

        expect(memory.messages.get(original.id)).toEqual(before);

        const current = {
            ...original,
            id: 'new-assistant',
            content: 'New response.',
            createdAt: '2026-10-19T00:01:00.000Z',
            modelContent: {
                format: 2,
                parts: [{ type: 'text', text: 'New response.' }],
            },
        };

        await storage.saveMessages({
            messages: [
                toTutorModelMessage(current, 'conversation-1', 'owner-1'),
            ],
        });

        expect(memory.messages.get(current.id)?.content).toBe('New response.');
        const updated = {
            ...current,
            modelContent: {
                format: 2,
                parts: [{ type: 'text', text: 'New response. Complete.' }],
            },
        };

        await storage.saveMessages({
            messages: [
                toTutorModelMessage(updated, 'conversation-1', 'owner-1'),
            ],
        });

        expect(memory.messages.get(current.id)?.content).toBe(
            'New response. Complete.',
        );

        expect(memory.messages.get(original.id)).toEqual(before);
    });

    it('gives the SDK an independent envelope so conversion metadata cannot mutate admitted input', () => {
        const original = {
            id: 'admitted-input',
            role: 'user' as const,
            content: 'Explain the exact editor copy.',
            createdAt: '2026-10-19T00:00:00.000Z',
            modelContent: projectTutorUserMessage({
                content: 'Explain the exact editor copy.',
                editorContext: { content: 'Admitted editor wording.' },
            }),
        };
        const before = structuredClone(original);
        const projected = toTutorModelMessage(
            original,
            'conversation-1',
            'owner-1',
        );

        projected.content.parts[0] = { type: 'text', text: 'SDK_MUTATION' };
        expect(original).toEqual(before);
    });

    it('keeps successive complete editor snapshots in their own historical messages', async () => {
        const { memory, storage } = fixture();
        const first = memory.messages.get('admitted-user')!;
        first.modelContent = projectTutorUserMessage({
            content: first.content,
            editorContext: { content: 'Older unsaved paragraph.' },
        });

        const second = {
            ...first,
            id: 'second-user',
            content: 'What changed?',
            modelContent: projectTutorUserMessage({
                content: 'What changed?',
                editorContext: { content: 'Newer unsaved paragraph.' },
            }),
        };

        memory.messages.set(second.id, second);
        const result = await storage.listMessages({
            threadId: 'conversation-1',
            orderBy: { direction: 'ASC' },
            perPage: 10,
        });

        expect(JSON.stringify(result.messages[0]?.content)).toContain(
            'Older unsaved paragraph.',
        );

        expect(JSON.stringify(result.messages[1]?.content)).toContain(
            'Newer unsaved paragraph.',
        );
    });

    it('rejects another thread or owner before reading or mutating application state', async () => {
        const { memory, storage } = fixture();
        const reading = vi.spyOn(memory.port, 'listMessages');
        const saving = vi.spyOn(memory.port, 'saveMessages');
        await expect(
            storage.listMessages({ threadId: 'other-conversation' }),
        ).rejects.toThrow('not authorized');

        await expect(
            storage.saveMessages({
                messages: [
                    toTutorModelMessage(
                        memory.messages.get('admitted-user')!,
                        'conversation-1',
                        'other-owner',
                    ),
                ],
            }),
        ).rejects.toThrow('not authorized');

        expect(reading).not.toHaveBeenCalled();
        expect(saving).not.toHaveBeenCalled();
    });

    it('keeps resolved model credentials out of actual SDK observational-memory initialization and updates', async () => {
        const { memory, storage } = fixture();
        const sentinel = 'SYNTHETIC_OM_CREDENTIAL_SENTINEL';
        const accounting = tutorAccountingFixture();
        const model = requireSupportedTutorModel(
            await resolveModelConfig({
                providerId: 'openai',
                modelId: 'gpt-4o-mini',
                url: 'http://synthetic.invalid/v1',
                apiKey: sentinel,
                headers: { Authorization: sentinel },
            }),
        );

        expect(JSON.stringify(model).includes(sentinel)).toBe(true);
        const modelGate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64_000,
        });
        const sdkMemory = createTutorMemory({
            conversationId: 'conversation-1',
            storage,
            model,
            modelGate,
            thresholds: {
                messageTokens: 1_000,
                observationTokens: 500,
                maxTokensPerBatch: 1_000,
            },
        });
        const engine = (await sdkMemory.omEngine)!;
        const record = await engine.getOrCreateRecord(
            'conversation-1',
            'owner-1',
        );
        const encoded = JSON.stringify([...memory.state.values()]);
        expect(encoded.includes(sentinel)).toBe(false);
        expect(encoded.includes('apiKey')).toBe(false);
        expect(encoded.includes('Authorization')).toBe(false);
        expect(encoded.includes('providerOptions')).toBe(false);
        expect(Buffer.byteLength(encoded)).toBeLessThan(4_096);
        expect(record.config).toMatchObject({
            observation: { messageTokens: 1_000 },
            reflection: { observationTokens: 500 },
        });

        expect(accounting.admit).not.toHaveBeenCalled();

        await storage.updateObservationalMemoryConfig({
            id: record.id,
            config: {
                model,
                headers: { Authorization: sentinel },
                observation: {
                    model,
                    messageTokens: 1_100,
                    providerOptions: { credential: sentinel },
                },
                _overrides: {
                    observation: {
                        messageTokens: { min: 900, max: 1_200 },
                        model,
                    },
                    reflection: {
                        observationTokens: 600,
                        gateway: { apiKey: sentinel },
                    },
                },
            },
        });

        await storage.updateObservationalMemoryConfig({
            id: record.id,
            config: {
                _overrides: {
                    reflection: {
                        observationTokens: 700,
                        headers: { Authorization: sentinel },
                    },
                },
            },
        });

        const updated = await storage.getObservationalMemory(
            'conversation-1',
            'owner-1',
        );

        expect(
            JSON.stringify([...memory.state.values()]).includes(sentinel),
        ).toBe(false);

        expect(updated?.config).toMatchObject({
            observation: { messageTokens: 1_100, maxTokensPerBatch: 1_000 },
            reflection: { observationTokens: 500 },
            _overrides: {
                observation: { messageTokens: { min: 900, max: 1_200 } },
                reflection: { observationTokens: 700 },
            },
        });

        await storage.updateObservationalMemoryConfig({
            id: record.id,
            config: {
                _overrides: { observation: { messageTokens: 1_200, model } },
            },
        });

        const status = await engine.getStatus({
            threadId: 'conversation-1',
            resourceId: 'owner-1',
        });

        expect(status.threshold).toBe(1_200);
        expect(status.effectiveObservationTokensThreshold).toBe(700);
    });

    it('projects older unsafe config on read and never copies it into subsequent metadata writes', async () => {
        const { memory, storage } = fixture();
        const sentinel = 'SYNTHETIC_OLDER_CONFIG_SENTINEL';
        const record = await storage.initializeObservationalMemory({
            threadId: 'conversation-1',
            resourceId: 'owner-1',
            scope: 'thread',
            config: {
                observation: { messageTokens: 1_000 },
                reflection: { observationTokens: 500 },
            },
        });
        const key = `observations:${record.id}`;
        const stored = memory.state.get(key)!;
        memory.state.set(key, {
            ...stored,
            config: {
                observation: {
                    messageTokens: 1_000,
                    model: { config: { apiKey: sentinel } },
                },
                reflection: { observationTokens: 500 },
                headers: { Authorization: sentinel },
            },
        });

        const read = await storage.getObservationalMemory(
            'conversation-1',
            'owner-1',
        );

        expect(JSON.stringify(read).includes(sentinel)).toBe(false);
        await storage.setPendingMessageTokens(record.id, 12);
        expect(JSON.stringify(memory.state.get(key)).includes(sentinel)).toBe(
            false,
        );

        expect(
            (await storage.getObservationalMemory('conversation-1', 'owner-1'))
                ?.pendingMessageTokens,
        ).toBe(12);
    });

    it('does not allow the SDK to introduce a fabricated historical user message', async () => {
        const { memory, storage } = fixture();
        await expect(
            storage.saveMessages({
                messages: [
                    toTutorModelMessage(
                        {
                            id: 'invented-user',
                            role: 'user',
                            content: 'Invented permission.',
                            createdAt: '2026-10-19T00:00:00.000Z',
                        },
                        'conversation-1',
                        'owner-1',
                    ),
                ],
            }),
        ).rejects.toThrow('not authorized');

        expect(memory.messages.has('invented-user')).toBe(false);
    });
});
