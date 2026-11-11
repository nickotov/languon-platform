import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type {
    DictionaryChatGenerationContext,
    DictionaryChatSnippet,
    DictionaryChatSnippetInput,
} from '@languon/contracts';
import { createDictionarySnippetTools } from './dictionary-snippet-tools';

const context: DictionaryChatGenerationContext = {
    sourceLanguage: 'fr',
    targetLanguage: 'en',
    translationContext: null,
    dictionaryVersion: 1,
    settingsVersion: 1,
    settings: {
        definitionEnabled: false,
        definitionLanguage: 'target',
        exampleEnabled: false,
        exampleLanguage: 'source',
        exampleTranslationEnabled: false,
        transcriptionEnabled: false,
        transcriptionNotation: 'ipa',
        transcriptionCustomLabel: null,
    },
};
const values = (index = 0) => ({
    source: `le mot ${index}`,
    translation: `word ${index}`,
    transcription: null,
    definition: null,
    example: null,
    exampleTranslation: null,
});
const cards = (count: number) =>
    Array.from({ length: count }, (_, i) => values(i));
const snippet = (count: number): DictionaryChatSnippet => ({
    id: randomUUID(),
    conversationId: randomUUID(),
    dictionaryId: randomUUID(),
    turnId: randomUUID(),
    title: 'Earlier words',
    cards: cards(count),
    generationContext: context,
    createdAt: '2026-11-11T00:00:00.000Z',
});

async function run(tool: unknown, input: unknown) {
    const executable = tool as {
        execute(input: unknown, context: unknown): Promise<unknown>;
    };

    return executable.execute(input, { agent: { toolCallId: randomUUID() } });
}

function setup(count?: number) {
    const source = count ? snippet(count) : undefined;
    const publish = vi.fn(async (_candidate: DictionaryChatSnippetInput) => ({
        id: randomUUID(),
    }));
    const read = vi.fn(async () => source!);
    const author = vi.fn(async (input: { count: number }) => ({
        title: 'Words',
        cards: cards(input.count),
    }));
    const tools = createDictionarySnippetTools(
        {
            canProposeDictionarySnippet: true,
            sourceContext: { dictionaryGenerationContext: context },
            signal: new AbortController().signal,
            onDictionarySnippet: publish,
            readDictionarySnippet: read,
        },
        author,
    );

    return { source, tools, publish, read, author };
}

describe('host-bound dictionary snippet generation', () => {
    it('resolves omitted count to ten before independent author output and persistence', async () => {
        const f = setup();
        const result = await run(f.tools.propose_dictionary_snippet, {
            request: 'Some useful words',
        });

        expect(f.author).toHaveBeenCalledWith(
            expect.objectContaining({ count: 10, context }),
        );

        expect(f.publish.mock.calls[0]![0].cards).toHaveLength(10);
        expect(result).toMatchObject({
            cardCount: 10,
            requiresLearnerApply: true,
        });
    });

    it('does not publish an author result with fewer cards than the independently resolved explicit count', async () => {
        const f = setup();
        f.author.mockResolvedValueOnce({ title: 'Partial', cards: cards(2) });

        await expect(
            run(f.tools.propose_dictionary_snippet, {
                request: 'Three words',
                count: 3,
            }),
        ).rejects.toThrow('complete requested card count');

        expect(f.author).toHaveBeenCalledWith(
            expect.objectContaining({ count: 3 }),
        );

        expect(f.publish).not.toHaveBeenCalled();
    });

    it('uses exact retained revision source and preserves its count when no change was requested', async () => {
        const f = setup(41);
        await run(f.tools.propose_dictionary_snippet, {
            request: 'Make these simpler',
            sourceSnippetId: f.source!.id,
        });

        expect(f.read).toHaveBeenCalledWith(f.source!.id);
        expect(f.author).toHaveBeenCalledWith(
            expect.objectContaining({ count: 41, source: f.source }),
        );

        expect(f.publish.mock.calls[0]![0].cards).toHaveLength(41);
    });

    it.each([41, 100])(
        'can read every exact card in a %i-card snippet with bounded pages',
        async (count) => {
            const f = setup(count);
            const read: { index: number; values: ReturnType<typeof values> }[] =
                [];
            let next: number | null = 0;
            while (next !== null) {
                const result = (await run(f.tools.read_dictionary_snippet, {
                    id: f.source!.id,
                    startIndex: next,
                    limit: 10,
                })) as {
                    cards: typeof read;
                    total: number;
                    nextIndex: number | null;
                };

                expect(
                    Buffer.byteLength(JSON.stringify(result)),
                ).toBeLessThanOrEqual(24_000);

                expect(result.total).toBe(count);
                read.push(...result.cards);
                next = result.nextIndex;
            }

            expect(read).toEqual(
                f.source!.cards.map((values, index) => ({ index, values })),
            );

            expect(f.publish).not.toHaveBeenCalled();
        },
    );
});
