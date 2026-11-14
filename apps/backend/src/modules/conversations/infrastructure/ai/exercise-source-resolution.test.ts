import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { LearningBlockSchema } from '@languon/contracts';
import { projectTutorUserMessage } from '../../application/tutor-message-context';
import { resolveExerciseSourceContexts } from './exercise-source-resolution';
import type { ExerciseAuthoringSource } from './exercise-authoring-context';

const block = LearningBlockSchema.parse({
    id: randomUUID(),
    type: 'vocabulary',
    language: 'fr',
    translationLanguage: 'en',
    entries: [{ id: randomUUID(), term: 'travail', translation: 'work' }],
});
const message = (references: string[] = []) => ({
    id: randomUUID(),
    role: 'user' as const,
    content: 'Generate exercises.',
    createdAt: new Date().toISOString(),
    modelContent: projectTutorUserMessage({
        content: 'Generate exercises.',
        blockReferences: references,
    }),
});
const brief = (
    source: { kind: 'editor'; blockId?: string } = {
        kind: 'editor',
        blockId: block.id,
    },
) => ({
    tasks: [
        {
            id: 'exercise',
            kind: 'exercises' as const,
            instruction: 'Practise.',
            language: 'fr',
            source,
        },
    ],
});

describe('exercise source resolution', () => {
    it('retains captured values only while their local identities still exist, reusing exact reads', async () => {
        if (block.type !== 'vocabulary') {
            throw new Error('Expected vocabulary fixture.');
        }

        const current = {
            ...block,
            entries: block.entries.map((entry) => ({
                ...entry,
                translation: 'Changed meaning.',
            })),
        };
        const readContext = vi.fn(async () => ({
            material: [
                {
                    id: block.id,
                    label: 'Current source',
                    content: JSON.stringify(current),
                },
            ],
            total: 1,
        }));
        const contexts = new Map<string, ExerciseAuthoringSource>([
            ['exercise', { blocks: [block] }],
            ['second', { blocks: [block] }],
        ]);
        const request = {
            tasks: [...brief().tasks, { ...brief().tasks[0]!, id: 'second' }],
        };
        const resolved = await resolveExerciseSourceContexts(
            { message: message(), sourceContext: {}, readContext },
            request,
            new Map(),
            contexts,
        );

        expect(readContext).toHaveBeenCalledOnce();
        expect(resolved.get('exercise')?.blocks).toEqual([block]);

        await expect(
            resolveExerciseSourceContexts(
                {
                    message: message(),
                    sourceContext: {},
                    readContext: async () => ({ material: [], total: 0 }),
                },
                brief(),
                new Map(),
                contexts,
            ),
        ).rejects.toThrow('unavailable');

        const removed = {
            ...current,
            entries: [
                {
                    id: randomUUID(),
                    term: 'replacement',
                    translation: 'Different material.',
                },
            ],
        };

        await expect(
            resolveExerciseSourceContexts(
                {
                    message: message(),
                    sourceContext: {},
                    readContext: async () => ({
                        material: [
                            {
                                id: block.id,
                                label: 'Changed source',
                                content: JSON.stringify(removed),
                            },
                        ],
                        total: 1,
                    }),
                },
                brief(),
                new Map(),
                contexts,
            ),
        ).rejects.toThrow('changed');
    });

    it('never reinterprets a malformed block catalog as an unrelated prose source', async () => {
        await expect(
            resolveExerciseSourceContexts(
                {
                    message: message(),
                    sourceContext: { availableBlocks: 'not a block catalog' },
                },
                brief({ kind: 'editor' }),
            ),
        ).rejects.toThrow('Select at most');
    });

    it('reads only the claimed referenced snapshot and rejects a mismatched requested ID', async () => {
        const readContext = async ({
            blockIds,
        }: {
            blockIds?: string[] | undefined;
        }) => ({
            material: blockIds?.includes(block.id)
                ? [
                      {
                          id: block.id,
                          label: 'Vocabulary',
                          content: JSON.stringify(block),
                      },
                  ]
                : [],
            total: 1,
        });
        const contexts = await resolveExerciseSourceContexts(
            {
                message: message([block.id]),
                sourceContext: { availableBlocks: [{ id: block.id }] },
                readContext,
            },
            brief(),
        );

        expect(contexts.get('exercise')?.blocks).toEqual([block]);
        await expect(
            resolveExerciseSourceContexts(
                {
                    message: message([block.id]),
                    sourceContext: { availableBlocks: [{ id: block.id }] },
                    readContext,
                },
                brief({ kind: 'editor', blockId: randomUUID() }),
            ),
        ).rejects.toThrow('differs');
    });

    it('fails closed for incomplete catalogs and unavailable selected passages', async () => {
        await expect(
            resolveExerciseSourceContexts(
                {
                    message: message(),
                    sourceContext: { blockCatalogComplete: false },
                },
                brief({ kind: 'editor' }),
            ),
        ).rejects.toThrow('Select at most');

        await expect(
            resolveExerciseSourceContexts(
                {
                    message: message(),
                    sourceContext: {},
                    sourceNote: { noteId: randomUUID(), noteVersion: 1 },
                },
                {
                    tasks: [
                        {
                            id: 'exercise',
                            kind: 'exercises',
                            instruction: 'Practise.',
                            language: 'fr',
                            source: { kind: 'selection' },
                        },
                    ],
                },
            ),
        ).rejects.toThrow('selected passage');
    });
});
