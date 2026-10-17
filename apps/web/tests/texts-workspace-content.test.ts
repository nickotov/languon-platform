import { describe, expect, it, vi } from 'vitest';
import type { TextDocument, TextTranslationProposal } from '@languon/contracts';
import { textsApi } from '@/fsd/entities/texts';
import {
    sourceCodePoints,
    workspaceTitle,
    workspaceValid,
    workspacePairs,
} from '@/fsd/pages/texts/lib/workspace-content';
import { persistWorkspace } from '@/fsd/pages/texts/lib/workspace-save';
const folderId = '123e4567-e89b-42d3-a456-426614174000';
const input = {
    title: '',
    sourceText: 'First line\n\nNext paragraph.',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
};
const document: TextDocument = {
    ...input,
    title: 'First line',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    folderId,
    id: folderId,
    status: 'draft',
    alignment: null,
    lifecycle: 'active',
    version: 1,
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
};
const proposal: TextTranslationProposal = {
    ...input,
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    id: folderId,
    textId: null,
    expectedTextVersion: null,
    alignment: {
        source: [
            {
                pairId: folderId,
                text: input.sourceText,
                startOffset: 0,
                endOffset: input.sourceText.length,
                paragraphIndex: 0,
            },
        ],
        translation: [{ pairId: folderId, text: 'Перевод.' }],
        editedPairIds: [],
    },
};
const request = <T>(operation: (token: string) => Promise<T>) =>
    operation('test-token');
describe('workspace source and explicit persistence', () => {
    it('counts Unicode code points and accepts exactly 20,000 astral characters', () => {
        expect(sourceCodePoints('😀')).toBe(1);
        expect(
            workspaceValid({ ...input, sourceText: '😀'.repeat(20_000) }),
        ).toBe(true);
        expect(
            workspaceValid({ ...input, sourceText: '😀'.repeat(20_001) }),
        ).toBe(false);
        expect(workspaceValid({ ...input, targetLanguage: 'en' })).toBe(false);
    });
    it('defaults title to first nonempty line without rewriting source', () => {
        expect(
            workspaceTitle({ ...input, sourceText: '\n\n  A title  \nrest' }),
        ).toBe('A title');
        expect(workspaceTitle({ ...input, title: ' Custom ' })).toBe('Custom');
    });
    it('preserves stable pair IDs and exact source text for both-side editing', () => {
        expect(workspacePairs({ alignment: proposal.alignment })).toEqual([
            {
                pairId: folderId,
                source: input.sourceText,
                translation: 'Перевод.',
            },
        ]);
    });
    it('creates an Auto proposal draft with the resolved proposal language', async () => {
        const create = vi
            .spyOn(textsApi, 'createText')
            .mockResolvedValue({ text: document });
        vi.spyOn(textsApi, 'saveText').mockResolvedValue({
            text: { ...document, alignment: proposal.alignment },
        });
        await persistWorkspace({
            request,
            folderId,
            document: null,
            input: { ...input, sourceLanguage: 'auto' },
            proposal,
            pairs: [],
            editing: false,
            reviewedVersion: null,
            onCreated: () => undefined,
        });
        expect(create).toHaveBeenCalledWith(
            'test-token',
            expect.objectContaining({ sourceLanguage: 'en' }),
        );
        vi.restoreAllMocks();
    });
    it('creates a draft only on explicit persistence and retains it if attachment fails for retry', async () => {
        vi.spyOn(textsApi, 'getText').mockResolvedValue({ text: document });
        const create = vi
            .spyOn(textsApi, 'createText')
            .mockResolvedValue({ text: document });
        const save = vi
            .spyOn(textsApi, 'saveText')
            .mockRejectedValueOnce(new Error('temporary'))
            .mockResolvedValueOnce({
                text: {
                    ...document,
                    status: 'translated',
                    alignment: proposal.alignment,
                    version: 2,
                },
            });
        let created: TextDocument | null = null;
        const onCreated = (next: TextDocument) => {
            created = next;
        };
        const options = {
            request,
            folderId,
            document: null,
            input,
            proposal,
            pairs: [],
            editing: false,
            reviewedVersion: null,
            onCreated,
        };
        await expect(persistWorkspace(options)).rejects.toThrow('temporary');
        expect(created).toBe(document);
        expect(create).toHaveBeenCalledTimes(1);
        await persistWorkspace({ ...options, document: created });
        expect(create).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenLastCalledWith('test-token', folderId, {
            kind: 'proposal',
            jobId: folderId,
            expectedVersion: 1,
            title: 'First line',
        });
        vi.restoreAllMocks();
    });
    it('uses an explicitly reviewed version for overwrite without changing IDs', async () => {
        const save = vi
            .spyOn(textsApi, 'saveText')
            .mockResolvedValue({ text: document });
        const pairs = [
            {
                pairId: folderId,
                source: 'edited source',
                translation: 'edited translation',
            },
        ];
        await persistWorkspace({
            request,
            folderId,
            document,
            input,
            proposal: null,
            pairs,
            editing: true,
            reviewedVersion: 7,
            onCreated: vi.fn(),
        });
        expect(save).toHaveBeenCalledWith('test-token', folderId, {
            kind: 'edits',
            expectedVersion: 7,
            pairs,
        });
        vi.restoreAllMocks();
    });
    it('reconciles an acknowledged proposal commit after its response is lost', async () => {
        const saved = {
            ...document,
            status: 'translated' as const,
            alignment: proposal.alignment,
            version: 2,
        };
        vi.spyOn(textsApi, 'saveText').mockRejectedValue(
            new Error('lost response'),
        );
        vi.spyOn(textsApi, 'getText').mockResolvedValue({ text: saved });
        await expect(
            persistWorkspace({
                request,
                folderId,
                document,
                input,
                proposal,
                pairs: [],
                editing: false,
                reviewedVersion: null,
                onCreated: vi.fn(),
            }),
        ).resolves.toEqual(saved);
        vi.restoreAllMocks();
    });
});
