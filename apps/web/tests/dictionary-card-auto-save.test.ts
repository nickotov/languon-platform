import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    DictionaryCard,
    DictionaryCardResponse,
} from '@languon/contracts';
import {
    DictionaryApiError,
    dictionaryApi,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import {
    createCardAutoSaver,
    type CardAutoSaveInput,
} from '@/fsd/widgets/dictionary-editor/lib/card-auto-save';
import { cardAuthoringAcceptance } from '@/fsd/widgets/dictionary-editor/lib/card-authoring-acceptance';

const card: DictionaryCard = {
    id: '20000000-0000-4000-8000-000000000001',
    dictionaryId: '10000000-0000-4000-8000-000000000001',
    archivedAt: null,
    authorship: 'human',
    lifecycle: 'active',
    position: '1000',
    createdAt: '2026-08-21T10:00:00.000Z',
    updatedAt: '2026-08-21T10:00:00.000Z',
    version: 1,
    settingsVersion: 1,
    translationContext: 'Local context',
    effectiveSettings: {
        definitionEnabled: false,
        definitionLanguage: 'source',
        exampleEnabled: true,
        exampleLanguage: 'source',
        exampleTranslationEnabled: true,
        exampleTranslationLanguage: 'target',
        transcriptionCustomLabel: null,
        transcriptionEnabled: false,
        transcriptionNotation: 'ipa',
    },
    overrides: {
        definitionEnabled: null,
        definitionLanguage: null,
        exampleEnabled: null,
        exampleLanguage: null,
        exampleTranslationEnabled: null,
        transcriptionCustomLabel: null,
        transcriptionEnabled: null,
        transcriptionNotation: null,
    },
    values: {
        source: 'hello',
        translation: 'hola',
        definition: null,
        example: null,
        exampleTranslation: null,
        transcription: null,
    },
};
const input: CardAutoSaveInput = {
    card,
    dictionaryVersion: 1,
    settingsVersion: 1,
    generation: {
        jobId: '30000000-0000-4000-8000-000000000001',
        format: 'card-authoring:v3',
    },
    selectedSuggestions: [
        {
            field: 'translation',
            suggestionId: '40000000-0000-4000-8000-000000000001',
        },
    ],
    draft: {
        values: {
            ...card.values,
            translation: 'buenas',
            example: 'Manually drafted example.',
        },
        overrides: card.overrides,
        translationContext: card.translationContext,
    },
};
const response: DictionaryCardResponse = {
    card: {
        ...card,
        values: input.draft.values,
        version: 2,
        authorship: 'mixed',
    },
    dictionaryVersion: 2,
};
const requestWithSession: RequestWithSession = (operation) =>
    operation('test-token');
const unavailable = () =>
    new DictionaryApiError(0, {
        code: 'service_unavailable',
        correlationId: 'test',
        message: 'Unavailable',
    });
const stale = () =>
    new DictionaryApiError(409, {
        code: 'version_conflict',
        correlationId: 'test',
        message: 'Changed',
    });

describe('inline card auto-save persistence', () => {
    let accept = vi.spyOn(dictionaryApi, 'acceptGenerationJob');
    let read = vi.spyOn(dictionaryApi, 'readCard');
    let readJob = vi.spyOn(dictionaryApi, 'readGenerationJob');
    let update = vi.spyOn(dictionaryApi, 'updateCard');
    beforeEach(() => {
        accept = vi.spyOn(dictionaryApi, 'acceptGenerationJob');
        read = vi.spyOn(dictionaryApi, 'readCard');
        readJob = vi.spyOn(dictionaryApi, 'readGenerationJob');
        update = vi.spyOn(dictionaryApi, 'updateCard');
        accept.mockResolvedValue({ outcome: { cardVersion: 2 } } as Awaited<
            ReturnType<typeof dictionaryApi.acceptGenerationJob>
        >);
        read.mockResolvedValue(response);
        update.mockResolvedValue(response);
    });
    const saver = () =>
        createCardAutoSaver(card.dictionaryId, requestWithSession);

    it('accepts the supplied job and the entire visible candidate, then reads canonical values', async () => {
        await expect(saver()(input)).resolves.toEqual(response);
        expect(accept).toHaveBeenCalledWith(
            'test-token',
            input.generation.jobId,
            {
                candidate: input.draft,
                format: input.generation.format,
                selectedSuggestions: input.selectedSuggestions,
            },
        );
        expect(read).toHaveBeenCalledWith(
            'test-token',
            card.dictionaryId,
            card.id,
        );
        expect(update).not.toHaveBeenCalled();
    });

    it('coalesces concurrent poll-driven applications', async () => {
        const save = saver();
        await Promise.all([save(input), save(input)]);
        expect(accept).toHaveBeenCalledTimes(1);
    });

    it('never accepts twice after success even when the same job is observed again', async () => {
        const save = saver();
        await save(input);
        await save(input);
        expect(accept).toHaveBeenCalledTimes(1);
    });

    it('retries only the read when accepted content cannot be refreshed', async () => {
        const save = saver();
        read.mockRejectedValueOnce(unavailable());
        await expect(save(input)).rejects.toMatchObject({
            freezeDraft: true,
            saved: true,
            reloadRequired: false,
        });
        await expect(save(input)).resolves.toEqual(response);
        expect(accept).toHaveBeenCalledTimes(1);
        expect(read).toHaveBeenCalledTimes(2);
    });

    it('preserves the candidate and requires reload when another revision appears after accepted read-back failed', async () => {
        const save = saver();
        read.mockRejectedValueOnce(unavailable());
        await expect(save(input)).rejects.toMatchObject({
            saved: true,
            freezeDraft: true,
        });
        read.mockResolvedValueOnce({
            ...response,
            card: {
                ...response.card,
                version: 3,
                values: {
                    ...response.card.values,
                    translation: 'Concurrent edit',
                },
            },
        });
        await expect(save(input)).rejects.toMatchObject({
            saved: true,
            freezeDraft: true,
            reloadRequired: true,
            cause: { detail: { code: 'version_conflict' } },
        });
        expect(accept).toHaveBeenCalledTimes(1);
    });

    it('requires the exact accepted revision even if a later revision has identical fields', async () => {
        read.mockResolvedValueOnce({
            ...response,
            card: { ...response.card, version: 3 },
        });
        await expect(saver()(input)).rejects.toMatchObject({
            saved: true,
            freezeDraft: true,
            cause: { detail: { code: 'version_conflict' } },
        });
    });

    it('rejects mismatched canonical content even when its version matches the accepted outcome', async () => {
        read.mockResolvedValueOnce({
            ...response,
            card: {
                ...response.card,
                values: {
                    ...response.card.values,
                    example: 'Different content',
                },
            },
        });
        await expect(saver()(input)).rejects.toMatchObject({
            saved: true,
            freezeDraft: true,
            cause: { detail: { code: 'version_conflict' } },
        });
    });

    it('allows canonical whitespace normalization without changing the accepted draft', async () => {
        const padded = {
            ...input,
            draft: {
                ...input.draft,
                translationContext: ` ${input.draft.translationContext} `,
                values: { ...input.draft.values, translation: ' buenas ' },
            },
        };
        await expect(saver()(padded)).resolves.toEqual(response);
        expect(accept.mock.calls[0]?.[2]).toMatchObject({
            candidate: padded.draft,
        });
    });

    it('reconciles an ambiguous acceptance using the accepted job before reading', async () => {
        const save = saver();
        accept.mockRejectedValueOnce(unavailable());
        readJob.mockResolvedValueOnce({
            job: { state: 'accepted', outcome: { cardVersion: 2 } },
        } as Awaited<ReturnType<typeof dictionaryApi.readGenerationJob>>);
        await expect(save(input)).rejects.toMatchObject({
            freezeDraft: true,
            saved: false,
        });
        await expect(save(input)).resolves.toEqual(response);
        expect(accept).toHaveBeenCalledTimes(1);
    });

    it('replays exactly the original candidate if an uncertain job remains reviewable', async () => {
        const save = saver();
        accept.mockRejectedValueOnce(unavailable());
        readJob.mockResolvedValueOnce({ job: { state: 'review' } } as Awaited<
            ReturnType<typeof dictionaryApi.readGenerationJob>
        >);
        await expect(save(input)).rejects.toMatchObject({ freezeDraft: true });
        await save({ ...input, dictionaryVersion: 5 });
        expect(accept.mock.calls[0]).toEqual(accept.mock.calls[1]);
    });

    it('rejects a changed payload while an ambiguous write is outstanding', async () => {
        const save = saver();
        accept.mockRejectedValueOnce(unavailable());
        await expect(save(input)).rejects.toMatchObject({ freezeDraft: true });
        await expect(
            save({
                ...input,
                draft: { ...input.draft, translationContext: 'Changed' },
            }),
        ).rejects.toMatchObject({ freezeDraft: true });
        expect(accept).toHaveBeenCalledTimes(1);
    });

    it('keeps definitive version conflicts editable instead of silently merging', async () => {
        accept.mockRejectedValueOnce(stale());
        await expect(saver()(input)).rejects.toMatchObject({
            freezeDraft: false,
            cause: { status: 409 },
        });
    });

    it('uses a normal optimistic update for manual changes when Source is unchanged', async () => {
        await saver()({ ...input, selectedSuggestions: [] });
        expect(accept).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith(
            'test-token',
            card.dictionaryId,
            card.id,
            {
                ...input.draft,
                expectedCardVersion: 1,
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
            },
        );
    });

    it('does not write a no-change result', async () => {
        read.mockResolvedValueOnce({ card, dictionaryVersion: 1 });
        await expect(
            saver()({
                ...input,
                selectedSuggestions: [],
                draft: {
                    values: card.values,
                    overrides: card.overrides,
                    translationContext: card.translationContext,
                },
            }),
        ).resolves.toMatchObject({ unchanged: true });
        expect(accept).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it('reconciles an ambiguous manual update without adding a second revision', async () => {
        const save = saver();
        const manual = { ...input, selectedSuggestions: [] };
        update.mockRejectedValueOnce(unavailable());
        await expect(save(manual)).rejects.toMatchObject({ freezeDraft: true });
        await expect(save(manual)).resolves.toEqual(response);
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('refuses to overwrite a different persisted card when a manual write is uncertain', async () => {
        const save = saver();
        const manual = { ...input, selectedSuggestions: [] };
        update.mockRejectedValueOnce(unavailable());
        await expect(save(manual)).rejects.toMatchObject({ freezeDraft: true });
        read.mockResolvedValueOnce({
            ...response,
            card: {
                ...response.card,
                values: {
                    ...response.card.values,
                    translation: 'Another editor',
                },
            },
        });
        await expect(save(manual)).rejects.toMatchObject({
            freezeDraft: false,
            cause: { status: 409 },
        });
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('keeps legacy acceptance formats compatible without leaking translation context', () => {
        const selections = [
            ...input.selectedSuggestions,
            { field: 'source' as const, suggestionId: 'source-id' },
        ];
        const legacy = cardAuthoringAcceptance(input.draft, selections, {
            ...input.generation,
            format: 'card-authoring:v1',
        });
        expect(legacy.candidate).not.toHaveProperty('translationContext');
        expect(
            'selectedSuggestions' in legacy && legacy.selectedSuggestions,
        ).toEqual(input.selectedSuggestions);
        const v2 = cardAuthoringAcceptance(input.draft, selections, {
            ...input.generation,
            format: 'card-authoring:v2',
        });
        expect(v2.candidate).not.toHaveProperty('translationContext');
        expect('selectedSuggestions' in v2 && v2.selectedSuggestions).toEqual(
            selections,
        );
    });
});
