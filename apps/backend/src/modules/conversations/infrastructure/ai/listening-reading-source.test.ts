import type { KnowledgeNode } from '@languon/contracts';
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
    readingFromPart,
    standaloneProposalReadings,
} from '../../application/generated-reading';
import { resolveListeningReading } from './listening-reading-source';
import type { LearningContentBrief } from '../../application/learning-content-contract';

const paragraph = (value: string): KnowledgeNode => ({
    type: 'paragraph',
    content: [{ type: 'text', text: value }],
});
const brief: LearningContentBrief = {
    tasks: [
        {
            id: 'scene',
            kind: 'audio',
            language: 'fr',
            instruction: 'Discuss the text.',
            source: { kind: 'generated-reading' },
        },
    ],
};
const source = {
    brief,
    replyLanguage: 'en',
    message: 'Discuss the selected text.',
    referencedBlocks: [],
};

describe('published reading sources for listening', () => {
    it('retains the complete ordinary prose proposal and only the requested lesson part', () => {
        const nodes = [
            paragraph('First reading'),
            paragraph('Same reading, next paragraph'),
            paragraph('Another reading'),
        ];
        expect(
            readingFromPart(
                'lesson',
                { kind: 'prose', taskId: 'first', startIndex: 0, nodeCount: 2 },
                nodes,
            )?.text,
        ).toBe('First reading\nSame reading, next paragraph');
        expect(
            standaloneProposalReadings('proposal', {
                schemaVersion: 2,
                document: { type: 'doc', content: nodes },
            }),
        ).toEqual([
            {
                key: 'proposal/prose',
                title: 'First reading',
                text: 'First reading\nSame reading, next paragraph\nAnother reading',
            },
        ]);
    });

    it('prefers an explicit passage or selected document block to a previous lesson', async () => {
        const read = async () => {
            throw Error('An explicit source needs no history lookup.');
        };
        const passage = await resolveListeningReading({
            ...source,
            selection: 'Bonjour !',
            read,
        });
        expect(passage.brief?.tasks[0]?.source).toEqual({ kind: 'selection' });
        const blocks = await resolveListeningReading({
            ...source,
            referencedBlocks: [randomUUID()],
            read,
        });
        expect(blocks.brief?.tasks[0]?.source).toEqual({ kind: 'editor' });
    });

    it('uses a single canonical reading, disambiguates identical titles and rechecks saved keys', async () => {
        const old = {
            key: 'lesson-a/prose',
            text: 'Ancien.',
            title: 'Actualités',
        };
        const recent = {
            key: 'lesson-b/prose',
            text: 'Récent.',
            title: 'Actualités',
        };
        expect(
            (
                await resolveListeningReading({
                    ...source,
                    read: async () => [old],
                })
            ).brief?.tasks[0]?.sourceText,
        ).toBe(old.text);
        const matches = await resolveListeningReading({
            ...source,
            read: async () => [old, recent],
        });
        expect(matches.choices?.map((choice) => choice.label)).toEqual([
            '1. Actualités',
            '2. Actualités',
        ]);
        const stale = await resolveListeningReading({
            ...source,
            read: async () => [recent],
            selectedKey: old.key,
        });
        expect(stale.brief).toBeUndefined();
    });
});
