import { describe, expect, it } from 'vitest';
import {
    CreateTextRequestSchema,
    MoveTextRequestSchema,
    EnqueueTextDetectionRequestSchema,
    CopySharedTextRequestSchema,
    CopySharedTextFolderRequestSchema,
    TextFolderSchema,
    EnqueueTextTranslationRequestSchema,
    EnqueueTextSelectionRequestSchema,
    TextAlignmentSchema,
    TextAiJobSchema,
    TextPairEditsSchema,
    TextSourceSchema,
    TextTranslationProposalSchema,
} from '../src/texts';
const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const content = {
    sourceText: 'Hello.',
    sourceLanguage: 'en',
    targetLanguage: 'es',
};
const alignment = {
    source: [
        {
            pairId: id,
            text: 'Hello.',
            startOffset: 0,
            endOffset: 6,
            paragraphIndex: 0,
        },
    ],
    translation: [{ pairId: id, text: 'Hola.' }],
    editedPairIds: [],
};
describe('Texts contracts', () => {
    it('accepts explicit independent membership for creation, copying and jobs', () => {
        expect(
            CreateTextRequestSchema.parse({ folderId: null, ...content })
                .folderId,
        ).toBeNull();
        expect(
            EnqueueTextDetectionRequestSchema.parse({
                folderId: null,
                operationId: id,
                sourceText: 'Hello.',
            }).folderId,
        ).toBeNull();
        expect(
            EnqueueTextTranslationRequestSchema.parse({
                folderId: null,
                operationId: id,
                ...content,
            }).folderId,
        ).toBeNull();
        expect(
            CopySharedTextRequestSchema.parse({
                folderId: null,
                operationId: id,
                expectedVersion: 1,
            }).folderId,
        ).toBeNull();
        expect(
            CopySharedTextRequestSchema.safeParse({
                folderId: null,
                newFolderName: 'Folder',
                operationId: id,
                expectedVersion: 1,
            }).success,
        ).toBe(false);
    });
    it('requires a version and exact shared-folder confirmation shape on moves', () => {
        expect(
            MoveTextRequestSchema.parse({ folderId: null, expectedVersion: 1 }),
        ).toEqual({ folderId: null, expectedVersion: 1 });
        expect(
            MoveTextRequestSchema.parse({
                folderId: id,
                expectedVersion: 2,
                sharedFolderConfirmation: { shareId: other, shareVersion: 3 },
            }).sharedFolderConfirmation?.shareVersion,
        ).toBe(3);
        expect(MoveTextRequestSchema.safeParse({ folderId: id }).success).toBe(
            false,
        );
        expect(
            MoveTextRequestSchema.safeParse({
                folderId: id,
                expectedVersion: 1,
                sharedFolderConfirmation: { shareId: other },
            }).success,
        ).toBe(false);
    });
    it('counts Unicode code points and preserves source whitespace', () => {
        expect(TextSourceSchema.parse(' \nHello.\n ')).toBe(' \nHello.\n ');
        expect(TextSourceSchema.safeParse('😀'.repeat(20_000)).success).toBe(
            true,
        );
        expect(TextSourceSchema.safeParse('😀'.repeat(20_001)).success).toBe(
            false,
        );
        expect(TextSourceSchema.safeParse('\ud800')).toMatchObject({
            success: false,
        });
        expect(TextSourceSchema.safeParse('\u0000')).toMatchObject({
            success: false,
        });
    });
    it('requires supported distinct languages and paired existing text references', () => {
        expect(
            CreateTextRequestSchema.safeParse({ folderId: id, ...content })
                .success,
        ).toBe(true);
        expect(
            CreateTextRequestSchema.safeParse({
                folderId: id,
                ...content,
                targetLanguage: 'en',
            }).success,
        ).toBe(false);
        expect(
            EnqueueTextTranslationRequestSchema.safeParse({
                folderId: id,
                operationId: other,
                ...content,
                textId: id,
            }).success,
        ).toBe(false);
    });
    it('rejects reordered pairs, fabricated edited IDs, gaps, and truncated mappings', () => {
        expect(TextAlignmentSchema.parse(alignment)).toEqual(alignment);
        expect(
            TextAlignmentSchema.safeParse({
                ...alignment,
                translation: [{ pairId: other, text: 'Hola.' }],
            }).success,
        ).toBe(false);
        expect(
            TextAlignmentSchema.safeParse({
                ...alignment,
                editedPairIds: [other],
            }).success,
        ).toBe(false);
        expect(
            TextAlignmentSchema.safeParse({ ...alignment, translation: [] })
                .success,
        ).toBe(false);
        expect(
            TextAlignmentSchema.safeParse({
                ...alignment,
                source: [{ ...alignment.source[0], startOffset: 1 }],
            }).success,
        ).toBe(false);
    });
    it('rejects proposal source rewriting and client assigned edit provenance', () => {
        const proposal = {
            id,
            ...content,
            alignment,
            textId: null,
            expectedTextVersion: null,
        };
        expect(TextTranslationProposalSchema.safeParse(proposal).success).toBe(
            true,
        );
        expect(
            TextTranslationProposalSchema.safeParse({
                ...proposal,
                sourceText: 'Changed.',
            }).success,
        ).toBe(false);
        expect(
            TextTranslationProposalSchema.safeParse({
                ...proposal,
                alignment: { ...alignment, editedPairIds: [id] },
            }).success,
        ).toBe(false);
    });
    it('never accepts a capability key or raw context in collection requests', () => {
        const request = {
            operationId: id,
            source: {
                kind: 'shared-text',
                shareId: 'abcdefghijklmnop',
                textId: id,
                expectedTextVersion: 1,
            },
            selection: {
                side: 'source',
                pairId: id,
                startOffset: 0,
                endOffset: 5,
            },
            target: { kind: 'new', name: 'Words' },
        };
        expect(
            EnqueueTextSelectionRequestSchema.safeParse(request).success,
        ).toBe(true);
        expect(
            EnqueueTextSelectionRequestSchema.safeParse({
                ...request,
                source: { ...request.source, key: 'secret' },
            }).success,
        ).toBe(false);
        expect(
            EnqueueTextSelectionRequestSchema.safeParse({
                ...request,
                context: 'Forged context',
            }).success,
        ).toBe(false);
    });
});

it('rejects impossible job state/result combinations and mismatched proposal identity', () => {
    const job = {
        id,
        kind: 'text-detection',
        state: 'completed',
        result: { language: 'en', confidence: 'high' },
        failureCode: null,
        createdAt: '2026-10-15T00:00:00Z',
        completedAt: '2026-10-15T00:00:01Z',
    };
    expect(TextAiJobSchema.safeParse(job).success).toBe(true);
    expect(
        TextAiJobSchema.safeParse({ ...job, state: 'running' }).success,
    ).toBe(false);
    expect(TextAiJobSchema.safeParse({ ...job, result: null }).success).toBe(
        false,
    );
    expect(
        TextAiJobSchema.safeParse({ ...job, kind: 'text-translation' }).success,
    ).toBe(false);
});
it('bounds cumulative manual edits and rejects duplicate pair identities', () => {
    const pair = { pairId: id, source: 'A'.repeat(11_000), translation: 'B' };
    expect(
        TextPairEditsSchema.safeParse([pair, { ...pair, pairId: other }])
            .success,
    ).toBe(false);
    expect(
        TextPairEditsSchema.safeParse([
            { ...pair, source: 'A' },
            { ...pair, source: 'A' },
        ]).success,
    ).toBe(false);
});

it('validates optional owner metadata and exactly one copy destination', () => {
    const request = { operationId: id, expectedVersion: 1 };
    expect(
        CopySharedTextRequestSchema.safeParse({ ...request, folderId: other })
            .success,
    ).toBe(true);
    expect(
        CopySharedTextRequestSchema.parse({
            ...request,
            newFolderName: '  Stories  ',
        }).newFolderName,
    ).toBe('Stories');
    for (const destination of [
        {},
        { folderId: other, newFolderName: 'Stories' },
        { newFolderName: ' ' },
        { newFolderName: 'a'.repeat(121) },
    ]) {
        expect(
            CopySharedTextRequestSchema.safeParse({
                ...request,
                ...destination,
            }).success,
        ).toBe(false);
    }
    const folder = {
        id,
        name: 'Stories',
        description: null,
        lifecycle: 'active',
        version: 1,
        createdAt: '2026-10-15T00:00:00Z',
        updatedAt: '2026-10-15T00:00:00Z',
    };
    expect(TextFolderSchema.safeParse(folder).success).toBe(true);
    expect(
        TextFolderSchema.safeParse({
            ...folder,
            textCount: 2,
            translatedCount: 1,
            isShared: true,
        }).success,
    ).toBe(true);
    expect(
        TextFolderSchema.safeParse({ ...folder, textCount: -1 }).success,
    ).toBe(false);
});

it('validates optional whole-folder copy names while preserving legacy requests', () => {
    expect(
        CopySharedTextFolderRequestSchema.safeParse({ operationId: id })
            .success,
    ).toBe(true);
    expect(
        CopySharedTextFolderRequestSchema.parse({
            operationId: id,
            newFolderName: ' Stories ',
        }).newFolderName,
    ).toBe('Stories');
    expect(
        CopySharedTextFolderRequestSchema.safeParse({
            operationId: id,
            newFolderName: ' ',
        }).success,
    ).toBe(false);
});

it('accepts optional UUID operation identity for explicit draft creation', () => {
    expect(
        CreateTextRequestSchema.safeParse({
            folderId: id,
            ...content,
            operationId: other,
        }).success,
    ).toBe(true);
    expect(
        CreateTextRequestSchema.safeParse({
            folderId: id,
            ...content,
            operationId: 'invalid',
        }).success,
    ).toBe(false);
});
