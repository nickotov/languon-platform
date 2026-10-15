import { act, renderHook } from '@testing-library/react';
import { useTextWorkspaceSave } from '@/fsd/pages/texts/hooks/use-text-workspace-save';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextDocument } from '@languon/contracts';
import { textsApi } from '@/fsd/entities/texts';
import { workspacePairs } from '@/fsd/pages/texts/lib/workspace-content';
import { persistWorkspace } from '@/fsd/pages/texts/lib/workspace-save';

const id = '123e4567-e89b-42d3-a456-426614174000';
const ids = [id, id.slice(0, -1) + '1', id.slice(0, -1) + '2'];
const source = [
    'The river flows quietly.\n\n',
    'We rested on the bank. ',
    'Birds sang nearby.',
];
const translation = [
    'La rivière coule doucement.\n\n',
    'Nous nous reposions sur la rive. ',
    'Des oiseaux chantaient.',
];
function documentFor(
    sourceText = source,
    translationText = translation,
): TextDocument {
    let offset = 0;
    return {
        id,
        folderId: id,
        title: 'River',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        sourceText: sourceText.join(''),
        status: 'translated',
        lifecycle: 'active',
        version: 3,
        createdAt: '2026-10-15T00:00:00.000Z',
        updatedAt: '2026-10-15T00:00:00.000Z',
        alignment: {
            source: sourceText.map((text, index) => {
                const startOffset = offset;
                offset += Array.from(text).length;
                return {
                    pairId: ids[index]!,
                    text,
                    startOffset,
                    endOffset: offset,
                    paragraphIndex: index ? 1 : 0,
                };
            }),
            translation: translationText.map((text, index) => ({
                pairId: ids[index]!,
                text,
            })),
            editedPairIds: [],
        },
    };
}
const request = <T>(operation: (token: string) => Promise<T>) =>
    operation('test-token');
async function savePairs(
    document: TextDocument,
    pairs = workspacePairs(document),
) {
    const save = vi
        .spyOn(textsApi, 'saveText')
        .mockResolvedValue({ text: document });
    await persistWorkspace({
        request,
        folderId: id,
        document,
        input: {
            title: document.title,
            sourceText: document.sourceText,
            sourceLanguage: 'en',
            targetLanguage: 'fr',
        },
        proposal: null,
        pairs,
        editing: true,
        reviewedVersion: null,
        onCreated: vi.fn(),
    });
    const body = save.mock.calls[0]![2];
    if (body.kind !== 'edits') throw new Error('Expected paired edits');
    return body.pairs;
}
afterEach(() => vi.restoreAllMocks());
describe('workspace sentence boundary preservation', () => {
    it('shows lexical content without paragraph and inter-sentence boundary whitespace in both editors', () => {
        const pairs = workspacePairs(documentFor());
        expect(pairs[0]).toEqual({
            pairId: ids[0],
            source: 'The river flows quietly.',
            translation: 'La rivière coule doucement.',
        });
        expect(pairs[1]?.source).toBe('We rested on the bank.');
        expect(pairs[1]?.translation).toBe('Nous nous reposions sur la rive.');
    });
    it('restores paragraph boundaries in the edits request after replacing both first-pair textareas', async () => {
        const document = documentFor();
        const pairs = workspacePairs(document);
        pairs[0] = {
            ...pairs[0]!,
            source: 'The river flows slowly.',
            translation: 'La rivière coule lentement.',
        };
        const sent = await savePairs(document, pairs);
        expect(sent.map((pair) => pair.source).join('')).toBe(
            'The river flows slowly.\n\nWe rested on the bank. Birds sang nearby.',
        );
        expect(sent.map((pair) => pair.translation).join('')).toBe(
            'La rivière coule lentement.\n\nNous nous reposions sur la rive. Des oiseaux chantaient.',
        );
        expect(sent.map((pair) => pair.pairId)).toEqual(ids);
    });
    it('round-trips original leading/trailing whitespace exactly, including CRLF and nonbreaking spaces', async () => {
        const originalSource = [
            '\t  A  sentence.\r\n\r\n',
            'Second\u00a0 sentence.\t ',
            'Third.\n',
        ];
        const originalTranslation = [
            '\u00a0Une  phrase.\n\n',
            'Deuxième phrase.  ',
            'Troisième.\r\n',
        ];
        const sent = await savePairs(
            documentFor(originalSource, originalTranslation),
        );
        expect(sent.map((pair) => pair.source)).toEqual(originalSource);
        expect(sent.map((pair) => pair.translation)).toEqual(
            originalTranslation,
        );
    });
    it('preserves internal spaces and user-entered whitespace while restoring the original boundaries', async () => {
        const document = documentFor();
        const pairs = workspacePairs(document);
        pairs[0] = {
            ...pairs[0]!,
            source: 'A  river\t flows.',
            translation: 'Une  rivière coule. ',
        };
        const sent = await savePairs(document, pairs);
        expect(sent[0]?.source).toBe('A  river\t flows.\n\n');
        expect(sent[0]?.translation).toBe('Une  rivière coule. \n\n');
    });
    it.each(['source', 'translation'] as const)(
        'rejects a whitespace-only %s edit before restoring structural separators',
        async (side) => {
            const document = documentFor();
            const pairs = workspacePairs(document);
            pairs[0] = { ...pairs[0]!, [side]: ' \t\n ' };
            const save = vi.spyOn(textsApi, 'saveText');
            const setShowErrors = vi.fn();
            const { result } = renderHook(() =>
                useTextWorkspaceSave({
                    request,
                    folderId: id,
                    document,
                    input: {
                        title: 'River',
                        sourceText: document.sourceText,
                        sourceLanguage: 'en',
                        targetLanguage: 'fr',
                    },
                    mode: 'edit',
                    pairs,
                    proposal: null,
                    previewExpired: false,
                    conflict: null,
                    setShowErrors,
                    setExpired: vi.fn(),
                    setConflict: vi.fn(),
                    setDocument: vi.fn(),
                    adopt: vi.fn(),
                    clearProposal: vi.fn(),
                }),
            );
            let saved: boolean | undefined;
            await act(async () => {
                saved = await result.current.save();
            });
            expect(saved).toBe(false);
            expect(setShowErrors).toHaveBeenCalledWith(true);
            expect(save).not.toHaveBeenCalled();
        },
    );
});
