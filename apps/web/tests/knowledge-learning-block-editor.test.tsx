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
import { BlockFormDialog } from '../src/fsd/features/knowledge-notes/ui/learning-block-authoring/block-form-dialog';
import { AudioBlockUpload } from '../src/fsd/features/knowledge-notes/ui/learning-block-authoring/audio-block-upload';
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
        fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
        const result = apply.mock.calls[0]?.[0];
        if (result?.type !== 'bilingual-text')
            throw new Error('Expected a bilingual block.');
        if (target !== 'ru')
            expect(result.translations).toContainEqual({
                language: 'ru',
                segments: [{ sourceSegmentId: segmentId, text: 'Привет.' }],
            });
        expect(result.translations).toContainEqual({
            language: target,
            segments: [
                { sourceSegmentId: segmentId, text: 'Updated translation.' },
            ],
        });
        if (target !== 'fr')
            expect(result.translations).toContainEqual({
                language: 'fr',
                segments: [{ sourceSegmentId: segmentId, text: 'Bonjour.' }],
            });
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
            schemaVersion: 1,
            document: { type: 'doc', content: [{ type: 'paragraph' }] },
        });
        const onChange = vi.fn();
        const ref = createRef<KnowledgeEditorHandle>();
        render(<KnowledgeEditor ref={ref} value={empty} onChange={onChange} />);
        await waitFor(() => expect(ref.current).not.toBeNull());
        fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Grammar' }),
        );
        fireEvent.change(screen.getByLabelText('Rule'), {
            target: { value: 'Use the past tense.' },
        });
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(onChange.mock.lastCall?.[0]).toMatchObject({ schemaVersion: 2 });
        expect(ref.current?.getSnapshot().content).toContain(
            'Use the past tense.',
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Block settings: Grammar' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Edit', exact: true }),
        );
        fireEvent.change(screen.getByLabelText('Rule'), {
            target: { value: 'Use the present tense.' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
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
            schemaVersion: 1,
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
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Audio' }));
        const file = new File(['synthetic audio'], 'sample.wav', {
            type: 'audio/wav',
        });
        fireEvent.change(
            screen.getByLabelText('Upload audio (WAV or MP3, up to 5 MiB)'),
            { target: { files: [file] } },
        );
        await screen.findByRole('button', { name: 'Apply changes' });
        expect(uploadAudio).toHaveBeenCalledWith(file);
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const saved = onChange.mock.lastCall?.[0];
        expect(saved).toMatchObject({ schemaVersion: 2 });
        expect(JSON.stringify(saved)).toContain(id);
    });
});

it('authors a manual exercise with selected source passages and retains them on edit', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Exercise' }));
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
    fireEvent.click(
        screen.getByRole('checkbox', { name: 'The train leaves at noon.' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(JSON.stringify(onChange.mock.lastCall?.[0])).toContain(
        '"source":{"blockId":"' +
            sourceId +
            '","segmentIds":["' +
            segmentId +
            '"]}',
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Block settings: Exercise' }),
    );
    fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Edit', exact: true }),
    );
    expect(screen.getByRole('combobox', { name: 'Hint source' })).toHaveValue(
        sourceId,
    );
    expect(
        screen.getByRole('checkbox', { name: 'The train leaves at noon.' }),
    ).toBeChecked();
});

it('appends a validated generated block as one undoable draft edit', async () => {
    const empty = KnowledgeBodySchema.parse({
        schemaVersion: 1,
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
    if (grammar.type !== 'grammar') throw new Error('Expected grammar');
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
    if (audio.type !== 'audio') throw new Error('Expected audio');
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
    fireEvent.click(
        screen.getByRole('button', { name: 'Apply changes', exact: true }),
    );
    expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
            id,
            type: 'video',
            description: 'A flower opens in the morning.',
        }),
    );
});
