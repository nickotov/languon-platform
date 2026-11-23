import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { exerciseActivityExamples } from '../src/fsd/entities/learning-blocks';
import { LessonDocumentBlocks } from '../src/fsd/features/knowledge-notes';
import { render } from './render';

const examples = exerciseActivityExamples('en');

it.each(['multiple-choice', 'fill-in-the-blank', 'free-text'] as const)(
    'opens %s in a read-only Knowledge editor with independent hint and answer disclosures',
    async (format) => {
        const { block, sources } = examples.find(
            (example) => example.block.format === format,
        )!;
        const hint = 'A private preview hint';
        const rationale = 'A private answer explanation';
        const { container } = render(
            <LessonDocumentBlocks
                body={{
                    schemaVersion: 2,
                    document: {
                        type: 'doc',
                        content: [
                            {
                                type: 'heading',
                                attrs: { level: 2 },
                                content: [
                                    { type: 'text', text: 'One lesson part' },
                                ],
                            },
                            {
                                type: 'learningBlock',
                                attrs: {
                                    block: {
                                        ...block,
                                        hint,
                                        explanation: rationale,
                                    },
                                },
                            },
                        ],
                    },
                }}
                dependencies={sources}
            />,
        );

        await screen.findByText(block.question);
        expect(container.querySelector('.tiptap')).toHaveAttribute(
            'contenteditable',
            'false',
        );

        expect(
            container.querySelector('[data-learning-block-id]'),
        ).toHaveAttribute('data-learning-block-id', block.id);

        expect(screen.queryByRole('toolbar')).toBeNull();
        expect(
            screen.queryByRole('button', { name: /check|retry|try again/i }),
        ).toBeNull();

        expect(screen.queryByText(rationale)).toBeNull();
        expect(screen.queryByText(hint)).toBeNull();
        expect(
            container.querySelector('input:enabled, textarea:enabled'),
        ).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
        expect(screen.getByText(hint)).toBeVisible();
        expect(screen.getByText('Hint shown')).toBeVisible();
        expect(screen.queryByText(rationale)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
        fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
        const result = screen.getByRole('status');
        expect(within(result).getByText('Reference answer')).toBeVisible();
        expect(screen.getByText('Answer shown')).toBeVisible();
        expect(within(result).getByText(block.referenceAnswer)).toBeVisible();
        expect(within(result).getByText(rationale)).toBeVisible();
        expect(screen.queryByText(hint)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Hide answer' }));
        expect(screen.queryByText(rationale)).toBeNull();
    },
);

it('renders a reused recording once and privately checks a dictation in the proposal editor', async () => {
    const example = examples.find((item) => item.activity.id === 'L02')!;
    const recording = example.recording!;
    const { container } = render(
        <LessonDocumentBlocks
            body={{
                schemaVersion: 2,
                document: {
                    type: 'doc',
                    content: [
                        {
                            type: 'learningBlock',
                            attrs: { block: example.block },
                        },
                    ],
                },
            }}
            dependencies={example.sources}
            audioUrls={{ [recording.block.assetId!]: recording.url }}
        />,
    );
    const answer = await screen.findByRole('textbox');
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    const player = container.querySelector('audio')!;
    const play = vi.spyOn(player, 'play').mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Play excerpt' }));
    expect(play).toHaveBeenCalledOnce();
    expect(player.currentTime).toBe(
        recording.excerpt.segments[0]?.timing?.startSeconds,
    );

    expect(
        screen.queryByText(example.block.referenceAnswer),
    ).not.toBeInTheDocument();

    fireEvent.change(answer, {
        target: { value: 'Of course. Please return it Monday.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^check( answer)?$/i }));
    expect(screen.getByText('Missing')).toBeVisible();
    expect(screen.getByText('Replace')).toBeVisible();
    expect(container.querySelector('ins')).toBeVisible();
    fireEvent.change(answer, {
        target: { value: 'of course please return it on friday' },
    });

    expect(container.querySelector('ins')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^check( answer)?$/i }));
    expect(screen.getAllByText('Correct').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(container.querySelectorAll('audio')).toHaveLength(1);
});
