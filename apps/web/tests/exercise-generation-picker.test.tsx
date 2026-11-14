import {
    act,
    fireEvent,
    render,
    renderHook,
    screen,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseGenerationPicker } from '@/fsd/features/knowledge-notes';
import { exerciseAllocations } from '@/fsd/features/knowledge-notes/lib/exercise-generation';
import { useExerciseComposer } from '@/fsd/widgets/contextual-assistant/hooks/use-exercise-composer';
import { useBlockReferences } from '@/fsd/widgets/contextual-assistant/hooks/use-block-references';

const sourceId = '11111111-1111-4111-8111-111111111111';
const sources = [
    {
        id: sourceId,
        type: 'vocabulary' as const,
        title: 'Travel words',
        language: 'en',
    },
];
const request = {
    mode: 'selected' as const,
    count: 5,
    activities: [
        { activityId: 'V01' as const, count: 3 },
        { activityId: 'V02' as const, count: 1 },
        { activityId: 'V03' as const, count: 1 },
    ],
    language: 'en',
    explanationLanguage: 'fr',
    difficulty: 'intermediate' as const,
};

describe('exercise generation picker', () => {
    it('prepares exact named allocations in selection order, without starting a model operation', () => {
        const prepare = vi.fn();
        render(
            <ExerciseGenerationPicker
                sources={sources}
                selectedIds={[sourceId]}
                locale='en'
                onClose={vi.fn()}
                onPrepare={prepare}
            />,
        );

        expect(screen.getByLabelText('Total questions')).toHaveValue(5);
        expect(screen.getByLabelText('Exercise language')).toHaveValue('en');
        fireEvent.click(
            screen.getByRole('radio', { name: 'Choose activities' }),
        );

        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Choose the meaning' }),
        );

        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Recall the word' }),
        );

        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Complete the sentence' }),
        );

        fireEvent.change(screen.getByLabelText('Explanation language'), {
            target: { value: 'fr' },
        });

        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare request' }),
        );

        expect(prepare).toHaveBeenCalledOnce();
        expect(prepare.mock.calls[0]![0]).toMatchObject({
            blockIds: [sourceId],
            request: {
                mode: 'selected',
                count: 5,
                language: 'en',
                explanationLanguage: 'fr',
                activities: [
                    { activityId: 'V02', count: 2 },
                    { activityId: 'V01', count: 2 },
                    { activityId: 'V03', count: 1 },
                ],
            },
        });

        expect(
            screen.queryByRole('checkbox', { name: 'Find the main idea' }),
        ).not.toBeInTheDocument();
    });

    it('requires at least one question per selected activity without silently increasing count', () => {
        render(
            <ExerciseGenerationPicker
                sources={sources}
                selectedIds={[sourceId]}
                locale='en'
                onClose={vi.fn()}
                onPrepare={vi.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole('radio', { name: 'Choose activities' }),
        );

        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Choose the meaning' }),
        );

        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Recall the word' }),
        );

        fireEvent.change(screen.getByLabelText('Total questions'), {
            target: { value: '1' },
        });

        expect(screen.getByLabelText('Total questions')).toHaveValue(1);
        expect(
            screen.getByText(
                'Activity counts must add up to the total (1–25), with at least one question for each activity.',
            ),
        ).toBeVisible();

        expect(
            screen.getByRole('button', { name: 'Prepare request' }),
        ).toBeDisabled();
    });

    it('preserves an existing explicit allocation when reopened', () => {
        const prepare = vi.fn();
        render(
            <ExerciseGenerationPicker
                sources={sources}
                selectedIds={[sourceId]}
                initialRequest={request}
                locale='en'
                onClose={vi.fn()}
                onPrepare={prepare}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare request' }),
        );

        expect(prepare.mock.calls[0]![0].request).toEqual(request);
    });

    it('preserves explicit activity counts until the user deliberately edits or redistributes them', () => {
        const prepare = vi.fn();
        render(
            <ExerciseGenerationPicker
                sources={sources}
                selectedIds={[sourceId]}
                initialRequest={request}
                locale='en'
                onClose={vi.fn()}
                onPrepare={prepare}
            />,
        );

        fireEvent.click(screen.getByText('Question distribution'));
        fireEvent.change(screen.getByLabelText('Total questions'), {
            target: { value: '6' },
        });

        expect(
            screen.getByLabelText('Questions for activity: Recall the word'),
        ).toHaveValue(3);

        expect(
            screen.getByLabelText('Questions for activity: Choose the meaning'),
        ).toHaveValue(1);

        expect(
            screen.getByRole('button', { name: 'Prepare request' }),
        ).toBeDisabled();

        fireEvent.change(
            screen.getByLabelText('Questions for activity: Recall the word'),
            { target: { value: '4' } },
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare request' }),
        );

        expect(prepare.mock.calls[0]![0].request).toMatchObject({
            count: 6,
            activities: [
                { activityId: 'V01', count: 4 },
                { activityId: 'V02', count: 1 },
                { activityId: 'V03', count: 1 },
            ],
        });
    });

    it('refuses contradictory initial counts without changing explicit choices', () => {
        render(
            <ExerciseGenerationPicker
                sources={sources}
                selectedIds={[sourceId]}
                initialRequest={{ ...request, count: 2 }}
                locale='en'
                onClose={vi.fn()}
                onPrepare={vi.fn()}
            />,
        );

        expect(screen.getByLabelText('Total questions')).toHaveValue(2);
        expect(
            screen.getByRole('button', { name: 'Prepare request' }),
        ).toBeDisabled();
    });

    it('does not invent a source or missing exercise language', () => {
        const { unmount } = render(
            <ExerciseGenerationPicker
                sources={[]}
                selectedIds={[]}
                locale='en'
                onClose={vi.fn()}
                onPrepare={vi.fn()}
            />,
        );

        expect(
            screen.getByText(
                'Choose vocabulary, grammar or text material first.',
            ),
        ).toBeVisible();

        expect(
            screen.getByRole('button', { name: 'Prepare request' }),
        ).toBeDisabled();

        unmount();

        render(
            <ExerciseGenerationPicker
                sources={[
                    { id: sourceId, type: 'grammar', title: 'Passive voice' },
                ]}
                selectedIds={[sourceId]}
                locale='en'
                onClose={vi.fn()}
                onPrepare={vi.fn()}
            />,
        );

        expect(screen.getByLabelText('Exercise language')).toHaveValue('');
        expect(
            screen.getByText('Enter valid exercise and explanation languages.'),
        ).toBeVisible();
    });

    it('uses selected text as reading material and never treats a later source change as replacement permission', () => {
        render(
            <ExerciseGenerationPicker
                sources={sources}
                selectedIds={[]}
                passage='The train arrived late.'
                language='en'
                locale='en'
                onClose={vi.fn()}
                onPrepare={vi.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole('radio', { name: 'Choose activities' }),
        );

        expect(
            screen.getByRole('checkbox', { name: 'Find the main idea' }),
        ).toBeVisible();

        expect(
            screen.queryByRole('checkbox', { name: 'Recall the word' }),
        ).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Find the main idea' }),
        );

        fireEvent.change(screen.getByLabelText('Source material'), {
            target: { value: sourceId },
        });

        expect(
            screen.getByRole('button', { name: 'Prepare request' }),
        ).toBeDisabled();

        expect(
            screen.getByText(
                'Some selected activities need different source material. Change the source or deselect them.',
            ),
        ).toBeVisible();

        fireEvent.click(
            screen.getByRole('checkbox', { name: /Find the main idea/u }),
        );

        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Recall the word' }),
        );

        expect(
            screen.getByRole('button', { name: 'Prepare request' }),
        ).toBeEnabled();
    });

    it('distributes counts without duplicate activities or unsupported totals', () => {
        expect(exerciseAllocations(['G06', 'G02', 'G03'], 5)).toEqual([
            { activityId: 'G06', count: 2 },
            { activityId: 'G02', count: 2 },
            { activityId: 'G03', count: 1 },
        ]);

        expect(exerciseAllocations(['V01', 'V01'], 5)).toBeNull();
        expect(exerciseAllocations([], 5)).toBeNull();
        expect(exerciseAllocations(['V01'], 26)).toBeNull();
    });
});

describe('exercise composer draft lifecycle', () => {
    it('replaces the exact trailing picker prompt while preserving a manual prefix', () => {
        let question = 'Keep the vocabulary simple.';
        const setQuestion = vi.fn((update) => {
            question = typeof update === 'function' ? update(question) : update;
        });
        const { result } = renderHook(() =>
            useExerciseComposer({
                conversationId: 'conversation',
                setQuestion,
                replaceReferences: vi.fn(),
            }),
        );

        act(() =>
            result.current.prepare({
                request,
                blockIds: [sourceId],
                prompt: 'Generate five exercises.',
            }),
        );

        expect(question).toBe(
            'Keep the vocabulary simple.\n\nGenerate five exercises.',
        );

        const revised = {
            ...request,
            count: 3,
            activities: [{ activityId: 'V01' as const, count: 3 }],
        };

        act(() =>
            result.current.prepare({
                request: revised,
                blockIds: [sourceId],
                prompt: 'Generate three exercises.',
            }),
        );

        expect(question).toBe(
            'Keep the vocabulary simple.\n\nGenerate three exercises.',
        );

        expect(question).not.toContain('five');
        expect(result.current.request).toEqual(revised);
    });

    it('replaces stale references for a block-menu generation request and still appends ordinary mentions', () => {
        const available = [
            { id: 'source-a', type: 'vocabulary' as const, title: 'Words A' },
            { id: 'source-b', type: 'grammar' as const, title: 'Rule B' },
            {
                id: 'source-c',
                type: 'bilingual-text' as const,
                title: 'Text C',
            },
        ];
        const { result, rerender } = renderHook(
            ({ external }) =>
                useBlockReferences('conversation', external, available),
            {
                initialProps: {
                    external: {
                        id: 'mention-a',
                        blockIds: ['source-a'],
                        exercisePicker: false,
                    },
                },
            },
        );

        expect(result.current.selected.map((source) => source.id)).toEqual([
            'source-a',
        ]);

        rerender({
            external: {
                id: 'generate-b',
                blockIds: ['source-b'],
                exercisePicker: true,
            },
        });

        expect(result.current.selected.map((source) => source.id)).toEqual([
            'source-b',
        ]);

        rerender({
            external: {
                id: 'mention-c',
                blockIds: ['source-c'],
                exercisePicker: false,
            },
        });

        expect(result.current.selected.map((source) => source.id)).toEqual([
            'source-b',
            'source-c',
        ]);
    });

    it('replaces exact source references atomically and retains them on limit failure', () => {
        const available = Array.from({ length: 9 }, (_, index) => ({
            id: `source-${index}`,
            type: 'grammar' as const,
            title: `Rule ${index}`,
        }));
        const { result } = renderHook(() =>
            useBlockReferences('conversation', undefined, available),
        );

        act(() => result.current.replace(['source-2', 'source-0']));
        expect(result.current.selected.map((source) => source.id)).toEqual([
            'source-2',
            'source-0',
        ]);

        act(() => result.current.replace(available.map((source) => source.id)));
        expect(result.current.limitReached).toBe(true);
        expect(result.current.selected.map((source) => source.id)).toEqual([
            'source-2',
            'source-0',
        ]);
    });

    it('retains explicit picker choices across initial conversation creation and clears only the accepted request', () => {
        let question = '';
        const setQuestion = vi.fn((update) => {
            question = typeof update === 'function' ? update(question) : update;
        });
        const replaceReferences = vi.fn();
        const { result, rerender } = renderHook(
            ({ conversationId }) =>
                useExerciseComposer({
                    conversationId,
                    setQuestion,
                    replaceReferences,
                }),
            { initialProps: { conversationId: null as string | null } },
        );

        act(() =>
            result.current.prepare({
                request,
                blockIds: [sourceId],
                prompt: 'Generate five questions.',
            }),
        );

        rerender({ conversationId: 'created-conversation' });
        expect(result.current.request).toEqual(request);
        expect(question).toBe('Generate five questions.');
        expect(replaceReferences).toHaveBeenCalledWith([sourceId]);
        act(() =>
            result.current.prepare({
                request,
                blockIds: [sourceId],
                prompt: 'Generate the revised selection.',
            }),
        );

        expect(question).toBe('Generate the revised selection.');
        act(() => result.current.accepted(request));
        expect(result.current.request).toBeUndefined();
    });
});
