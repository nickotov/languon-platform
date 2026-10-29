import {
    act,
    fireEvent,
    screen,
    waitFor,
    cleanup,
} from '@testing-library/react';
import { render } from './render';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningBlockSchema } from '@languon/contracts';
import { BlockFormDialog } from '../src/fsd/features/knowledge-notes/ui/learning-block-authoring/block-form-dialog';
import { defaultAuthoringLabels } from '../src/fsd/features/knowledge-notes/ui/learning-block-authoring/block-labels';
import { copyLearningBlocks } from '../src/fsd/features/knowledge-notes/lib/learning-block-copy';
import { blockFieldTarget } from '../src/fsd/features/knowledge-notes/lib/block-field-target';

const id = '11111111-1111-4111-8111-111111111111';
const rowId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const vocabulary = LearningBlockSchema.parse({
    id,
    type: 'vocabulary',
    language: 'fr',
    translationLanguage: 'ru',
    entries: [{ id: rowId, term: 'joie', translation: 'работа' }],
});
const result = {
    job: {
        id: jobId,
        status: 'completed',
        result: {
            status: 'suggested',
            proposedValue: 'радость',
            explanation: 'A natural translation of joie.',
        },
        failureCode: null,
        createdAt: '2026-10-29T10:00:00.000Z',
        completedAt: '2026-10-29T10:00:01.000Z',
    },
};
const session = async <T,>(operation: (token: string) => Promise<T>) =>
    operation('synthetic-token');
const context = { requestWithSession: session, noteId: id, branchId: id };
function show(onApply = vi.fn().mockReturnValue(true)) {
    return render(
        <BlockFormDialog
            kind='vocabulary'
            block={vocabulary}
            labels={defaultAuthoringLabels}
            onClose={vi.fn()}
            onApply={onApply}
            sources={[]}
            fieldAi={context}
        />,
    );
}
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('atomic block authoring fields', () => {
    it('previews one validated field result, rejects stale source, and only applies after acceptance and Apply', async () => {
        const fetcher = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetcher);
        const apply = vi.fn().mockReturnValue(true);
        show(apply);
        const check = await screen.findByRole('button', {
            name: 'Check translation',
        });
        await waitFor(() => expect(check).not.toBeDisabled());
        fireEvent.click(check);
        await screen.findByText('радость');
        expect(apply).not.toHaveBeenCalled();
        const body = JSON.parse(fetcher.mock.calls[0]![1].body as string);
        expect(body.field).toMatchObject({
            entryId: rowId,
            sourceText: 'joie',
            currentValue: 'работа',
            sourceLanguage: 'fr',
            targetLanguage: 'ru',
        });
        fireEvent.change(screen.getByLabelText('Word or phrase'), {
            target: { value: 'travail' },
        });
        expect(
            await screen.findByText(
                'This field or its source changed. Check again before applying this suggestion.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Accept', exact: true }),
        ).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Word or phrase'), {
            target: { value: 'joie' },
        });
        fireEvent.click(
            await screen.findByRole('button', { name: 'Accept', exact: true }),
        );
        expect(screen.getByLabelText('Translation')).toHaveValue('радость');
        expect(apply).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
        expect(apply).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: [
                    expect.objectContaining({
                        id: rowId,
                        term: 'joie',
                        translation: 'радость',
                    }),
                ],
            }),
        );
    });
    it('cancels a job returned after the editor was removed and never applies late output', async () => {
        let resolvePost!: (response: Response) => void;
        const fetcher = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        resolvePost = resolve;
                    }),
            )
            .mockResolvedValue(
                new Response(
                    JSON.stringify({
                        ...result,
                        job: {
                            ...result.job,
                            status: 'cancelled',
                            result: null,
                        },
                    }),
                    { status: 200 },
                ),
            );
        vi.stubGlobal('fetch', fetcher);
        const apply = vi.fn();
        const view = show(apply);
        const check = await screen.findByRole('button', {
            name: 'Check translation',
        });
        await waitFor(() => expect(check).not.toBeDisabled());
        fireEvent.click(check);
        await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
        view.unmount();
        await act(async () => {
            resolvePost(
                new Response(
                    JSON.stringify({
                        ...result,
                        job: {
                            ...result.job,
                            status: 'queued',
                            result: null,
                            completedAt: null,
                        },
                    }),
                    { status: 200 },
                ),
            );
        });
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        expect(fetcher.mock.calls[1]![0]).toContain(`/${jobId}/cancel`);
        expect(apply).not.toHaveBeenCalled();
    });
    it('preserves local edits and waits for explicit discard', () => {
        show();
        fireEvent.change(screen.getByLabelText('Word or phrase'), {
            target: { value: 'travail' },
        });
        fireEvent.click(
            screen.getAllByRole('button', { name: 'Cancel', exact: true })[0]!,
        );
        expect(
            screen.getByRole('alertdialog', { name: 'Discard changes?' }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
        expect(screen.getByLabelText('Word or phrase')).toHaveValue('travail');
    });
    it('allowlists translation paths and captures source and language for stale protection', () => {
        const data = new FormData();
        data.set('language', 'fr');
        data.set('translationLanguage', 'ru');
        data.set('entries.0.id', rowId);
        data.set('entries.0.term', 'joie');
        expect(
            blockFieldTarget(
                'vocabulary',
                'entries.0.translation',
                'радость',
                data,
            ),
        ).toMatchObject({ entryId: rowId, sourceText: 'joie' });
        expect(
            blockFieldTarget('vocabulary', 'entries.0.id', 'x', data),
        ).toBeNull();
    });
    it('copies an exercise set with a shared fresh group and independent question identities', () => {
        const groupId = crypto.randomUUID();
        const make = () =>
            LearningBlockSchema.parse({
                id: crypto.randomUUID(),
                type: 'exercise',
                format: 'free-text',
                question: 'What is this?',
                referenceAnswer: 'An example.',
                explanation: 'The source says so.',
                group: { id: groupId, title: 'Practice' },
            });
        const originals = [make(), make()];
        const copied = copyLearningBlocks(originals);
        expect(copied.map((block) => block.id)).not.toEqual(
            originals.map((block) => block.id),
        );
        expect(
            copied[0]!.type === 'exercise' &&
                copied[1]!.type === 'exercise' &&
                copied[0]!.group?.id === copied[1]!.group?.id,
        ).toBe(true);
        expect(copied[0]!.type === 'exercise' && copied[0]!.group?.id).not.toBe(
            groupId,
        );
    });
});

it('reuses the operation identity after an unknown submit failure', async () => {
    const fetcher = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Network interrupted'))
        .mockResolvedValueOnce(Response.json(result));
    vi.stubGlobal('fetch', fetcher);
    show();
    const check = await screen.findByRole('button', {
        name: 'Check translation',
    });
    await waitFor(() => expect(check).not.toBeDisabled());
    fireEvent.click(check);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByText('радость');
    const first = JSON.parse(fetcher.mock.calls[0]![1].body as string);
    const second = JSON.parse(fetcher.mock.calls[1]![1].body as string);
    expect(second.operationId).toBe(first.operationId);
    expect(second).toEqual(first);
});

it('keeps incomplete multilingual drafts while switching languages and preserves source segment identities', async () => {
    const segment = crypto.randomUUID();
    const bilingual = LearningBlockSchema.parse({
        id,
        type: 'bilingual-text',
        language: 'en',
        segments: [{ id: segment, text: 'Hello.' }],
        translations: [
            {
                language: 'ru',
                segments: [{ sourceSegmentId: segment, text: 'Привет.' }],
            },
            {
                language: 'fr',
                segments: [{ sourceSegmentId: segment, text: 'Bonjour.' }],
            },
        ],
    });
    const apply = vi.fn().mockReturnValue(true);
    render(
        <BlockFormDialog
            kind='bilingual-text'
            block={bilingual}
            labels={defaultAuthoringLabels}
            onClose={vi.fn()}
            onApply={apply}
            sources={[]}
        />,
    );
    fireEvent.change(screen.getByLabelText('Original passage'), {
        target: { value: 'Good morning.' },
    });
    fireEvent.change(screen.getByLabelText('Translated passage'), {
        target: { value: 'Доброе утро.' },
    });
    expect(
        await screen.findByText(
            'The original changed. Review every prepared translation before applying changes.',
        ),
    ).toBeInTheDocument();
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Prepared translation' }),
        { target: { value: 'fr' } },
    );
    expect(screen.getByLabelText('Original passage')).toHaveValue(
        'Good morning.',
    );
    expect(screen.getByLabelText('Translated passage')).toHaveValue('Bonjour.');
    fireEvent.change(screen.getByLabelText('Translated passage'), {
        target: { value: 'Bonjour, ce matin.' },
    });
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Prepared translation' }),
        { target: { value: 'ru' } },
    );
    expect(screen.getByLabelText('Translated passage')).toHaveValue(
        'Доброе утро.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(apply).toHaveBeenCalledOnce();
    expect(apply.mock.calls[0]![0]).toMatchObject({
        segments: [{ id: segment, text: 'Good morning.' }],
        translations: [
            {
                language: 'ru',
                segments: [{ sourceSegmentId: segment, text: 'Доброе утро.' }],
            },
            {
                language: 'fr',
                segments: [
                    { sourceSegmentId: segment, text: 'Bonjour, ce matin.' },
                ],
            },
        ],
    });
});

it('requires every existing prepared language to cover a new source segment without silently dropping a language', async () => {
    const segment = crypto.randomUUID();
    const bilingual = LearningBlockSchema.parse({
        id,
        type: 'bilingual-text',
        language: 'en',
        segments: [{ id: segment, text: 'Hello.' }],
        translations: [
            {
                language: 'ru',
                segments: [{ sourceSegmentId: segment, text: 'Привет.' }],
            },
            {
                language: 'fr',
                segments: [{ sourceSegmentId: segment, text: 'Bonjour.' }],
            },
        ],
    });
    const apply = vi.fn().mockReturnValue(true);
    render(
        <BlockFormDialog
            kind='bilingual-text'
            block={bilingual}
            labels={defaultAuthoringLabels}
            onClose={vi.fn()}
            onApply={apply}
            sources={[]}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    fireEvent.change(screen.getAllByLabelText('Original passage')[1]!, {
        target: { value: 'Good night.' },
    });
    fireEvent.change(screen.getAllByLabelText('Translated passage')[1]!, {
        target: { value: 'Спокойной ночи.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Prepared translation' }),
        { target: { value: 'fr' } },
    );
    expect(screen.getAllByLabelText('Original passage')[1]).toHaveValue(
        'Good night.',
    );
    fireEvent.change(screen.getAllByLabelText('Translated passage')[1]!, {
        target: { value: 'Bonne nuit.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(apply).toHaveBeenCalledOnce();
    const saved = apply.mock.calls[0]![0];
    expect(
        saved.translations.map((value: { language: string }) => value.language),
    ).toEqual(['ru', 'fr']);
    expect(
        saved.translations.every(
            (value: { segments: unknown[] }) => value.segments.length === 2,
        ),
    ).toBe(true);
    expect(saved.segments[0].id).toBe(segment);
    expect(saved.translations[0].segments[1].sourceSegmentId).toBe(
        saved.segments[1].id,
    );
});

it('keeps existing language controls behind the quiet pair disclosure and retains an optional definition', async () => {
    if (vocabulary.type !== 'vocabulary')
        throw new Error('Expected vocabulary');
    const block = LearningBlockSchema.parse({
        ...vocabulary,
        title: 'Words',
        entries: [
            { ...vocabulary.entries[0], definition: 'A feeling of happiness.' },
        ],
    });
    const apply = vi.fn().mockReturnValue(true);
    render(
        <BlockFormDialog
            kind='vocabulary'
            block={block}
            labels={defaultAuthoringLabels}
            onClose={vi.fn()}
            onApply={apply}
            sources={[]}
        />,
    );
    const languages = await screen.findByRole('button', {
        name: 'Languages: French → Russian',
    });
    expect(languages.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByLabelText('Content language')).not.toBeVisible();
    fireEvent.click(languages);
    await waitFor(() =>
        expect(languages).toHaveAttribute('aria-expanded', 'true'),
    );
    fireEvent.change(screen.getByLabelText('Content language'), {
        target: { value: 'de' },
    });
    fireEvent.change(screen.getByLabelText('Word or phrase'), {
        target: { value: 'Freude' },
    });
    expect(screen.getByText('· Freude')).toBeInTheDocument();
    expect(screen.getByLabelText('Definition')).toHaveValue(
        'A feeling of happiness.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(apply.mock.calls[0]![0]).toMatchObject({
        language: 'de',
        entries: [
            expect.objectContaining({ definition: 'A feeling of happiness.' }),
        ],
    });
});
