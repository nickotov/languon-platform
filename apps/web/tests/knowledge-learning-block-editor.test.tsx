import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    KnowledgeBodySchema,
    LearningBlockSchema,
    type LearningBlock,
} from '@languon/contracts';
import {
    KnowledgeEditor,
    type KnowledgeEditorHandle,
} from '../src/fsd/features/knowledge-notes';
import { normalizeEditorDocument } from '../src/fsd/features/knowledge-notes/lib/editor-document';
import { copyLearningBlock } from '../src/fsd/features/knowledge-notes/lib/learning-block-copy';
import { readBlockForm } from '../src/fsd/features/knowledge-notes/lib/learning-block-form';
import { render } from './render';
import { BlockFormDialog } from '../src/fsd/features/knowledge-notes/ui/learning-block-authoring/ui/block-form-dialog/block-form-dialog';
import { AudioBlockUpload } from '../src/fsd/features/knowledge-notes/ui/learning-block-authoring/ui/audio-block-upload/audio-block-upload';
import { defaultAuthoringLabels } from '../src/fsd/features/knowledge-notes/ui/learning-block-authoring/block-labels';

const id = '11111111-1111-4111-8111-111111111111';
const grammar = LearningBlockSchema.parse({
    id,
    type: 'grammar',
    language: 'en',
    rule: '<script>alert(1)</script>',
});
const body = KnowledgeBodySchema.parse({
    schemaVersion: 2,
    document: {
        type: 'doc',
        content: [
            { type: 'paragraph' },
            { type: 'learningBlock', attrs: { block: grammar } },
        ],
    },
});

it.each(['ru', 'fr', 'de'])(
    'edits or adds %s without removing other prepared translations',
    (target) => {
        const segmentId = '22222222-2222-4222-8222-222222222222';
        const bilingual = LearningBlockSchema.parse({
            id,
            type: 'bilingual-text',
            language: 'en',
            segments: [{ id: segmentId, text: 'Hello.' }],
            translations: [
                {
                    language: 'ru',
                    segments: [{ sourceSegmentId: segmentId, text: 'Привет.' }],
                },
                {
                    language: 'fr',
                    segments: [
                        { sourceSegmentId: segmentId, text: 'Bonjour.' },
                    ],
                },
            ],
        });
        const apply = vi.fn((_block: LearningBlock) => true);
        render(
            <BlockFormDialog
                kind='bilingual-text'
                block={bilingual}
                labels={defaultAuthoringLabels}
                onApply={apply}
                onClose={() => {}}
                sources={[]}
            />,
        );

        fireEvent.change(
            screen.getByRole('combobox', { name: 'Prepared translation' }),
            { target: { value: target === 'de' ? '' : target } },
        );

        expect(screen.getByLabelText('Translated passage')).toHaveValue(
            target === 'ru' ? 'Привет.' : target === 'fr' ? 'Bonjour.' : '',
        );

        fireEvent.change(screen.getByLabelText('Translation language'), {
            target: { value: target },
        });

        fireEvent.change(screen.getByLabelText('Translated passage'), {
            target: { value: 'Updated translation.' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        const result = apply.mock.calls[0]?.[0];
        if (result?.type !== 'bilingual-text') {
            throw new Error('Expected a bilingual block.');
        }

        if (target !== 'ru') {
            expect(result.translations).toContainEqual({
                language: 'ru',
                segments: [{ sourceSegmentId: segmentId, text: 'Привет.' }],
            });
        }

        expect(result.translations).toContainEqual({
            language: target,
            segments: [
                { sourceSegmentId: segmentId, text: 'Updated translation.' },
            ],
        });

        if (target !== 'fr') {
            expect(result.translations).toContainEqual({
                language: 'fr',
                segments: [{ sourceSegmentId: segmentId, text: 'Bonjour.' }],
            });
        }

        expect(
            result.translations.map((translation) => translation.language),
        ).toEqual(target === 'de' ? ['ru', 'fr', 'de'] : ['ru', 'fr']);
    },
);

describe('learning block editor', () => {
    it('round trips structured blocks without stripping payload or reverting to v1', () => {
        expect(normalizeEditorDocument(body.document)).toEqual(body);
        expect(() =>
            normalizeEditorDocument({
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: { block: grammar, onclick: 'alert(1)' },
                    },
                ],
            }),
        ).toThrow();

        expect(() =>
            normalizeEditorDocument({
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: { block: grammar },
                        text: 'hidden text',
                    },
                ],
            }),
        ).toThrow();
    });

    it('copies identities without carrying forbidden dependencies', () => {
        const copied = copyLearningBlock(grammar);
        expect(copied.id).not.toBe(grammar.id);
        expect(copied).toMatchObject({ rule: '<script>alert(1)</script>' });
        expect(() =>
            copyLearningBlock({ id, type: 'audio', assetId: id }),
        ).toThrow(/authorized/);

        expect(() =>
            copyLearningBlock({
                id,
                type: 'exercise',
                format: 'free-text',
                question: 'Why?',
                referenceAnswer: 'A',
                explanation: 'Because',
                source: { blockId: id, segmentIds: [id] },
            }),
        ).toThrow(/together/);
    });

    it('validates author forms and preserves original bilingual spacing', () => {
        const form = new FormData();
        form.set('language', 'en');
        form.set('translationLanguage', 'fr');
        form.set('segments.0.text', '  Original.\n');
        form.set('segments.0.translation', ' Traduction. ');
        const result = readBlockForm('bilingual-text', form, { segments: 1 });
        expect(result).toMatchObject({
            segments: [{ text: '  Original.\n' }],
            translations: [{ segments: [{ text: ' Traduction. ' }] }],
        });

        const video = new FormData();
        video.set('video', 'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ');
        expect(() => readBlockForm('video', video, {})).toThrow();
    });

    it('renders literal hostile text and includes block context in chat snapshots', async () => {
        const ref = createRef<KnowledgeEditorHandle>();
        const onChange = vi.fn();
        const { container } = render(
            <KnowledgeEditor ref={ref} value={body} onChange={onChange} />,
        );

        await waitFor(() => expect(ref.current).not.toBeNull());
        expect(
            await screen.findByText('<script>alert(1)</script>'),
        ).toBeVisible();

        expect(container.querySelector('script')).toBeNull();
        expect(ref.current?.getSnapshot().content).toContain(
            '<script>alert(1)</script>',
        );

        expect(onChange).not.toHaveBeenCalled();
    });

    it('adds and edits a grammar block only through explicit Apply', async () => {
        const empty = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: { type: 'doc', content: [{ type: 'paragraph' }] },
        });
        const onChange = vi.fn();
        const ref = createRef<KnowledgeEditorHandle>();
        render(<KnowledgeEditor ref={ref} value={empty} onChange={onChange} />);
        await waitFor(() => expect(ref.current).not.toBeNull());
        fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Grammar', exact: true }),
        );

        fireEvent.change(await screen.findByLabelText('Rule'), {
            target: { value: 'Use the past tense.' },
        });

        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(onChange.mock.lastCall?.[0]).toMatchObject({ schemaVersion: 2 });
        expect(ref.current?.getSnapshot().content).toContain(
            'Use the past tense.',
        );

        await act(async () => {});
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Block settings: Grammar' }),
            );
        });

        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Edit', exact: true }),
        );

        fireEvent.change(await screen.findByLabelText('Rule'), {
            target: { value: 'Use the present tense.' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(ref.current?.getSnapshot().content).toContain(
            'Use the present tense.',
        );

        await act(async () => {
            expect(ref.current?.applyProposal('Replacement', 'replace')).toBe(
                'missing',
            );
        });
    });

    it('allows selecting the same audio again after a failed upload', async () => {
        const upload = vi
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({ assetId: crypto.randomUUID() });
        const ready = vi.fn();
        render(
            <AudioBlockUpload
                upload={upload}
                disabled={false}
                labels={defaultAuthoringLabels}
                onReady={ready}
            />,
        );

        const input = screen.getByLabelText(
            'Upload audio (WAV or MP3, up to 5 MiB)',
        ) as HTMLInputElement;
        const file = new File(['RIFF'], 'retry.wav', { type: 'audio/wav' });
        Object.defineProperty(input, 'value', {
            configurable: true,
            writable: true,
            value: 'retry.wav',
        });

        fireEvent.change(input, { target: { files: [file] } });
        await screen.findByRole('alert');
        expect(input.value).toBe('');
        input.value = 'retry.wav';
        fireEvent.change(input, { target: { files: [file] } });
        await waitFor(() => expect(ready).toHaveBeenCalledOnce());
        expect(upload).toHaveBeenCalledTimes(2);
        expect(upload).toHaveBeenNthCalledWith(2, file);
        expect(input.value).toBe('');
    });

    it('uploads an audio asset before explicit block application', async () => {
        const empty = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: { type: 'doc', content: [{ type: 'paragraph' }] },
        });
        const uploadAudio = vi.fn().mockResolvedValue({ assetId: id });
        const onChange = vi.fn();
        const ref = createRef<KnowledgeEditorHandle>();
        render(
            <KnowledgeEditor
                ref={ref}
                value={empty}
                onChange={onChange}
                uploadAudio={uploadAudio}
            />,
        );

        await waitFor(() => expect(ref.current).not.toBeNull());
        fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Audio', exact: true }),
        );

        const file = new File(['synthetic audio'], 'sample.wav', {
            type: 'audio/wav',
        });

        fireEvent.change(
            screen.getByLabelText('Upload audio (WAV or MP3, up to 5 MiB)'),
            { target: { files: [file] } },
        );

        await screen.findByRole('button', { name: 'Apply' });
        expect(uploadAudio).toHaveBeenCalledWith(file);
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const saved = onChange.mock.lastCall?.[0];
        expect(saved).toMatchObject({ schemaVersion: 2 });
        expect(JSON.stringify(saved)).toContain(id);
    });
});

it('authors a manual exercise with selected source passages and retains them on edit', async () => {
    const user = userEvent.setup();
    const sourceId = '22222222-2222-4222-8222-222222222222';
    const segmentId = '33333333-3333-4333-8333-333333333333';
    const source = {
        id: sourceId,
        type: 'bilingual-text',
        title: 'Reading source',
        language: 'en',
        segments: [{ id: segmentId, text: 'The train leaves at noon.' }],
        translations: [],
    };
    const sourceBody = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                { type: 'paragraph' },
                { type: 'learningBlock', attrs: { block: source } },
            ],
        },
    });
    const editor = createRef<KnowledgeEditorHandle>();
    const onChange = vi.fn();
    render(
        <KnowledgeEditor ref={editor} value={sourceBody} onChange={onChange} />,
    );

    await waitFor(() => expect(editor.current).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Add block' }));
    await user.click(
        await screen.findByRole('button', { name: 'Exercises', exact: true }),
    );

    await user.click(
        await screen.findByRole('button', {
            name: 'Custom exercise',
            exact: true,
        }),
    );

    fireEvent.change(screen.getByLabelText('Question'), {
        target: { value: 'When does the train leave?' },
    });

    fireEvent.change(screen.getByLabelText('Reference answer'), {
        target: { value: 'At noon.' },
    });

    fireEvent.change(screen.getByLabelText('Why the answer is correct'), {
        target: { value: 'The passage says it leaves at noon.' },
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Hint source' }), {
        target: { value: sourceId },
    });

    await user.click(
        screen.getByRole('checkbox', { name: 'The train leaves at noon.' }),
    );

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(JSON.stringify(onChange.mock.lastCall?.[0])).toContain(
        '"source":{"blockId":"' +
            sourceId +
            '","segmentIds":["' +
            segmentId +
            '"]}',
    );

    await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await user.click(
        screen.getByRole('button', { name: 'Block settings: Exercise' }),
    );

    const edit = await screen.findByRole('menuitem', {
        name: 'Edit',
        exact: true,
    });

    await waitFor(() => expect(edit).toBeEnabled());
    await user.click(
        await screen.findByRole('menuitem', { name: 'Edit', exact: true }),
    );

    expect(
        await screen.findByRole('combobox', { name: 'Hint source' }),
    ).toHaveValue(sourceId);

    expect(
        screen.getByRole('checkbox', { name: 'The train leaves at noon.' }),
    ).toBeChecked();
});

it('appends a validated generated block as one undoable draft edit', async () => {
    const empty = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const editor = createRef<KnowledgeEditorHandle>();
    const onChange = vi.fn();
    render(<KnowledgeEditor ref={editor} value={empty} onChange={onChange} />);
    await waitFor(() => expect(editor.current).not.toBeNull());
    act(() => {
        expect(editor.current?.appendLearningBlock(grammar)).toBe(true);
    });

    expect(editor.current?.getSnapshot().content).toContain(
        '<script>alert(1)</script>',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
    expect(editor.current?.getSnapshot().content).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Redo', exact: true }));
    expect(editor.current?.getSnapshot().content).toContain(
        '<script>alert(1)</script>',
    );

    if (grammar.type !== 'grammar') {
        throw new Error('Expected grammar');
    }

    act(() => {
        expect(
            editor.current?.appendLearningBlock({
                ...grammar,
                id: crypto.randomUUID(),
                rule: 'x'.repeat(80_001),
            }),
        ).toBe(false);
    });

    expect(editor.current?.getSnapshot().content).not.toContain(
        'x'.repeat(100),
    );
});

it('refreshes block authoring controls after an externally recovered document replaces editor content', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const editor = createRef<KnowledgeEditorHandle>();
    const onChange = vi.fn();
    const { rerender } = render(
        <KnowledgeEditor ref={editor} value={body} onChange={onChange} />,
    );

    await waitFor(() => expect(editor.current).not.toBeNull());
    expect(
        screen.getAllByRole('button', { name: /^Block settings:/ }),
    ).toHaveLength(1);

    const recovered = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                ...(body.document.content ?? []),
                {
                    type: 'learningBlock',
                    attrs: {
                        block: {
                            id: '22222222-2222-4222-8222-222222222222',
                            type: 'grammar',
                            title: 'Recovered rule',
                            language: 'en',
                            rule: 'New content from the saved branch.',
                        },
                    },
                },
            ],
        },
    });

    rerender(
        <I18nProvider locale='en' messages={en}>
            <KnowledgeEditor
                ref={editor}
                value={recovered}
                onChange={onChange}
            />
        </I18nProvider>,
    );

    await waitFor(() =>
        expect(
            screen.getAllByRole('button', { name: /^Block settings:/ }),
        ).toHaveLength(2),
    );

    expect(editor.current?.getSnapshot().content).toContain(
        'New content from the saved branch.',
    );

    expect(onChange).not.toHaveBeenCalled();
    const renderWarnings = consoleError.mock.calls.filter((args) =>
        args.some(
            (value) => typeof value === 'string' && value.includes('flushSync'),
        ),
    );

    consoleError.mockRestore();
    expect(renderWarnings).toEqual([]);
});

it('applies a captured audio transcript atomically and rejects stale or retargeted replacements', async () => {
    const audio = LearningBlockSchema.parse({ id, type: 'audio', assetId: id });
    const sourceBody = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                { type: 'paragraph' },
                { type: 'learningBlock', attrs: { block: audio } },
            ],
        },
    });
    const editor = createRef<KnowledgeEditorHandle>();
    render(
        <KnowledgeEditor ref={editor} value={sourceBody} onChange={vi.fn()} />,
    );

    await waitFor(() => expect(editor.current).not.toBeNull());
    const rule = LearningBlockSchema.parse({
        id: '22222222-2222-4222-8222-222222222222',
        type: 'grammar',
        language: 'en',
        rule: 'Unrelated newer material.',
    });

    act(() => {
        expect(editor.current?.appendLearningBlock(rule)).toBe(true);
    });

    if (audio.type !== 'audio') {
        throw new Error('Expected audio');
    }

    const replacement = {
        ...audio,
        transcript: {
            language: 'en',
            segments: [
                {
                    id: '33333333-3333-4333-8333-333333333333',
                    text: 'A faithful transcript.',
                },
            ],
        },
    };

    act(() => {
        expect(editor.current?.replaceLearningBlock(audio, replacement)).toBe(
            'applied',
        );
    });

    expect(editor.current?.getSnapshot().content).toContain(
        'A faithful transcript.',
    );

    expect(editor.current?.getSnapshot().content).toContain(
        'Unrelated newer material.',
    );

    act(() => {
        expect(editor.current?.replaceLearningBlock(audio, replacement)).toBe(
            'changed',
        );
    });

    act(() => {
        expect(
            editor.current?.replaceLearningBlock(replacement, {
                ...replacement,
                assetId: rule.id,
            }),
        ).toBe('invalid');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
    expect(editor.current?.getSnapshot().content).not.toContain(
        'A faithful transcript.',
    );

    expect(editor.current?.getSnapshot().content).toContain(
        'Unrelated newer material.',
    );
});

it('edits exactly one video description control and preserves that value on Apply', () => {
    const block = LearningBlockSchema.parse({
        id,
        type: 'video',
        source: { kind: 'youtube', videoId: 'dQw4w9WgXcQ' },
        description: 'Original scene description.',
    });
    const onApply = vi.fn(() => true);
    render(
        <BlockFormDialog
            kind='video'
            block={block}
            labels={defaultAuthoringLabels}
            onClose={() => {}}
            onApply={onApply}
            sources={[]}
        />,
    );

    const descriptions = screen.getAllByLabelText('Author’s description', {
        exact: true,
    });

    expect(descriptions).toHaveLength(1);
    fireEvent.change(descriptions[0]!, {
        target: { value: 'A flower opens in the morning.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply', exact: true }));

    expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
            id,
            type: 'video',
            description: 'A flower opens in the morning.',
        }),
    );
});

it('opens a named-activity manual action as Custom with the matching answer format', async () => {
    render(
        <BlockFormDialog
            kind='exercise'
            initialFormat='multiple-choice'
            labels={defaultAuthoringLabels}
            onApply={vi.fn(() => true)}
            onClose={vi.fn()}
            sources={[]}
        />,
    );

    expect(await screen.findByLabelText('Answer format')).toHaveValue(
        'multiple-choice',
    );

    expect(screen.getByText('Custom exercise')).toBeInTheDocument();
    expect(screen.getByLabelText('Question')).toHaveValue('');
    expect(screen.queryByText('Keep named activity')).not.toBeInTheDocument();
});

it('filters the nested exercise list through one editable search input', async () => {
    const empty = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const editor = createRef<KnowledgeEditorHandle>();
    render(<KnowledgeEditor ref={editor} value={empty} onChange={vi.fn()} />);
    await waitFor(() => expect(editor.current).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Exercises', exact: true }),
    );

    expect(screen.getAllByRole('textbox', { name: /^Search/u })).toHaveLength(
        1,
    );

    expect(
        screen.queryByRole('searchbox', { name: 'Search exercises' }),
    ).not.toBeInTheDocument();

    const search = screen.getByRole('textbox', {
        name: 'Search blocks and exercises',
    });

    fireEvent.change(search, { target: { value: 'V02' } });
    expect(screen.getByRole('button', { name: /^V02\s/u })).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: /^V03\s/u }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'V03' } });
    expect(screen.getByRole('button', { name: /^V03\s/u })).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: /^V02\s/u }),
    ).not.toBeInTheDocument();
});

it('returns focus to the insertion button when its picker is dismissed with Escape', async () => {
    const user = userEvent.setup();
    const empty = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const editor = createRef<KnowledgeEditorHandle>();
    render(<KnowledgeEditor ref={editor} value={empty} onChange={vi.fn()} />);
    await waitFor(() => expect(editor.current).not.toBeNull());
    const trigger = screen.getByRole('button', {
        name: 'Add block',
        exact: true,
    });

    await user.click(trigger);
    await screen.findByRole('textbox', { name: 'Search blocks and exercises' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(
        screen.queryByRole('textbox', { name: 'Search blocks and exercises' }),
    ).not.toBeInTheDocument();
});

it('creates a Custom exercise set at the cursor without replacing prose and undoes the whole set once', async () => {
    const user = userEvent.setup();
    // JSDOM has no text-range geometry; ProseMirror scrolls the restored text cursor on undo.
    const geometry = ['getClientRects', 'getBoundingClientRect'] as const;
    const previousGeometry = geometry.map((name) =>
        Object.getOwnPropertyDescriptor(Range.prototype, name),
    );

    Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value: () => [],
    });

    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(),
    });

    try {
        const original = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: 'Keep earlier material.' },
                        ],
                    },
                ],
            },
        });
        const editor = createRef<KnowledgeEditorHandle>();
        const onChange = vi.fn();
        render(
            <KnowledgeEditor
                ref={editor}
                value={original}
                onChange={onChange}
            />,
        );

        await waitFor(() => expect(editor.current).not.toBeNull());
        await user.click(
            screen.getByRole('button', { name: 'Add block', exact: true }),
        );

        await user.click(
            await screen.findByRole('button', {
                name: 'Exercises',
                exact: true,
            }),
        );

        await user.click(
            await screen.findByRole('button', {
                name: 'Custom exercise set',
                exact: true,
            }),
        );

        await user.click(
            await screen.findByRole('button', {
                name: 'Add question',
                exact: true,
            }),
        );

        const questions = screen.getAllByLabelText('Question', { exact: true });
        const answers = screen.getAllByLabelText('Reference answer', {
            exact: true,
        });
        const explanations = screen.getAllByLabelText(
            'Why the answer is correct',
            {
                exact: true,
            },
        );

        expect(questions).toHaveLength(2);
        questions.forEach((question, index) => {
            fireEvent.change(question, {
                target: { value: `Question ${index + 1}?` },
            });

            fireEvent.change(answers[index]!, {
                target: { value: `Answer ${index + 1}.` },
            });

            fireEvent.change(explanations[index]!, {
                target: { value: `Explanation ${index + 1}.` },
            });
        });

        await user.click(
            screen.getByRole('button', { name: 'Apply', exact: true }),
        );

        await waitFor(() =>
            expect(editor.current?.getSnapshot().content).toContain(
                'Question 2?',
            ),
        );

        const inserted = KnowledgeBodySchema.parse(onChange.mock.lastCall![0]);
        const exercises = inserted.document.content!.flatMap((node) =>
            node.attrs?.block?.type === 'exercise' ? [node.attrs.block] : [],
        );

        expect(exercises).toHaveLength(2);
        expect(exercises[0]!.group?.id).toBe(exercises[1]!.group?.id);
        expect(exercises.every((exercise) => !exercise.semantics)).toBe(true);
        expect(inserted.document.content![0]!.type).toBe('learningBlock');
        expect(editor.current?.getSnapshot().content).toContain(
            'Keep earlier material.',
        );

        await user.click(
            screen.getByRole('button', { name: 'Undo', exact: true }),
        );

        await waitFor(() =>
            expect(
                KnowledgeBodySchema.parse(onChange.mock.lastCall![0]),
            ).toEqual(original),
        );
    } finally {
        geometry.forEach((name, index) => {
            const previous = previousGeometry[index];
            if (previous) {
                Object.defineProperty(Range.prototype, name, previous);
            } else {
                Reflect.deleteProperty(Range.prototype, name);
            }
        });
    }
});
