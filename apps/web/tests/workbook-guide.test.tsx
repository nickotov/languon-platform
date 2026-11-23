import { playAudioExcerpt } from '../src/fsd/entities/learning-blocks/lib/play-audio-excerpt';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { WorkbookExercisesLayout } from '../src/fsd/pages/workbook-guide/ui/workbook-exercises-layout/workbook-exercises-layout';
import { guideActivities } from '../src/fsd/pages/workbook-guide/lib/examples';
import { PromptRecipe } from '../src/fsd/pages/workbook-guide/ui/prompt-recipe/prompt-recipe';
import { guideUiCopy } from '../src/fsd/pages/workbook-guide/ui/copy';

afterEach(cleanup);
const activities = guideActivities('en');
describe('workbook guide practice', () => {
    it('checks a prepared answer locally and clears it on reset and switch', () => {
        render(<WorkbookExercisesLayout locale='en' activities={activities} />);
        const demo = () => within(screen.getByTestId('workbook-demo'));
        fireEvent.click(
            demo().getByRole('radio', { name: 'Give something back' }),
        );

        fireEvent.click(demo().getByRole('button', { name: 'Check answer' }));
        expect(demo().getAllByText('Correct').length).toBeGreaterThan(0);
        fireEvent.click(demo().getByRole('button', { name: 'Reset example' }));
        expect(
            demo().getByRole('radio', { name: 'Give something back' }),
        ).not.toBeChecked();

        fireEvent.change(screen.getByLabelText('Activity'), {
            target: { value: 'V07' },
        });

        expect(
            demo().queryByRole('button', { name: 'Check answer' }),
        ).not.toBeInTheDocument();

        expect(
            demo().queryByRole('button', { name: 'Check with AI' }),
        ).not.toBeInTheDocument();

        const navigation = within(
            screen.getByRole('navigation', { name: 'Activities' }),
        );

        expect(navigation.getAllByRole('button')).toHaveLength(22);
        for (const category of guideUiCopy('en').categories) {
            expect(navigation.getByText(category)).toBeInTheDocument();
        }

        expect(
            navigation.getByRole('button', { name: /^V07\s/u }),
        ).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(navigation.getByRole('button', { name: /^V02\s/u }));
        expect(screen.getByLabelText('Activity')).toHaveValue('V02');
        expect(
            navigation.getByRole('button', { name: /^V02\s/u }),
        ).toHaveAttribute('aria-pressed', 'true');

        expect(
            navigation.getByRole('button', { name: /^V07\s/u }),
        ).toHaveAttribute('aria-pressed', 'false');

        expect(
            demo().getByRole('radio', { name: 'Give something back' }),
        ).not.toBeChecked();

        expect(new URL(window.location.href).searchParams.get('activity')).toBe(
            'V02',
        );
    });

    it('keeps arbitrary typed answers separate from preset feedback', () => {
        render(
            <WorkbookExercisesLayout
                locale='en'
                activities={activities}
                initialActivity='R04'
            />,
        );

        const demo = () => within(screen.getByTestId('workbook-demo'));
        fireEvent.change(demo().getByRole('textbox'), {
            target: { value: 'My arbitrary response' },
        });

        fireEvent.click(
            screen.getByRole('button', { name: 'Show sample feedback' }),
        );

        const panel = within(screen.getByTestId('sample-feedback'));
        expect(panel.getByText(/This prepared feedback/)).toBeInTheDocument();
        expect(
            demo().queryByText(
                'The response completes the task and preserves the source meaning.',
            ),
        ).not.toBeInTheDocument();

        expect(demo().getByRole('textbox')).toHaveValue(
            'My arbitrary response',
        );

        const navigation = within(
            screen.getByRole('navigation', { name: 'Activities' }),
        );

        fireEvent.click(navigation.getByRole('button', { name: /^V07\s/u }));
        expect(screen.getByLabelText('Activity')).toHaveValue('V07');
        expect(demo().getByRole('textbox')).toHaveValue('');
        expect(
            screen
                .getByTestId('sample-feedback')
                .querySelector('[data-outcome]'),
        ).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Activity'), {
            target: { value: 'R04' },
        });

        expect(
            navigation.getByRole('button', { name: /^R04\s/u }),
        ).toHaveAttribute('aria-pressed', 'true');

        expect(demo().getByRole('textbox')).toHaveValue('');
    });

    it('preserves selectable content when clipboard is denied', async () => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: vi.fn().mockRejectedValue(new Error('denied')),
            },
        });

        render(
            <PromptRecipe
                title='Recipe'
                text='Exact source and prompt'
                copyLabel='Copy'
                copy={guideUiCopy('en')}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Copy is unavailable',
        );

        expect(screen.getByText('Exact source and prompt')).toBeInTheDocument();
    });
});

it('replays only the dictation excerpt in the source player and hides the transcript until requested', async () => {
    const example = activities.find((item) => item.activity.id === 'L02')!;
    const source = example.recording!;
    const { container } = render(
        <WorkbookExercisesLayout
            locale='en'
            activities={activities}
            initialActivity='L02'
        />,
    );
    const audio = container.querySelector('audio')!;
    expect(audio.src).toContain('/workbook/library-dialogue.mp3');
    const play = vi.spyOn(audio, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => {});
    const range = source.excerpt.segments[0]!.timing!;
    fireEvent.click(screen.getByRole('button', { name: 'Play excerpt' }));
    expect(play).toHaveBeenCalledOnce();
    expect(audio.currentTime).toBe(range.startSeconds);
    audio.currentTime = range.endSeconds;
    fireEvent.timeUpdate(audio);
    expect(pause).toHaveBeenCalledOnce();
    expect(screen.queryByText(example.block.referenceAnswer)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show transcript' }));
    expect(screen.getByText(example.block.referenceAnswer)).toBeVisible();
    expect(screen.getByText('Librarian', { exact: true })).toBeVisible();
    expect(container.querySelectorAll('audio')).toHaveLength(1);
});

it('reveals timed meaning evidence after a check and marks a listening gap individually', () => {
    render(
        <WorkbookExercisesLayout
            locale='en'
            activities={activities}
            initialActivity='L01'
        />,
    );

    const demo = () => within(screen.getByTestId('workbook-demo'));
    expect(
        demo().queryByRole('button', { name: 'Hear the evidence' }),
    ).toBeNull();

    fireEvent.click(
        demo().getByRole('radio', { name: 'To change the opening hours.' }),
    );

    fireEvent.click(demo().getByRole('button', { name: 'Check answer' }));
    expect(
        demo().getByRole('button', { name: 'Hear the evidence' }),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('Activity'), {
        target: { value: 'L04' },
    });

    fireEvent.change(demo().getByRole('textbox', { name: 'Gap 1' }), {
        target: { value: 'Tuesday' },
    });

    fireEvent.click(demo().getByRole('button', { name: 'Check answer' }));
    expect(demo().getByRole('listitem')).toHaveTextContent('Gap 1 · Incorrect');
    expect(demo().getByRole('listitem').querySelector('ins')).toHaveTextContent(
        'Friday',
    );
});

it('skips unrelated speech between cited ranges and stops at the final boundary', async () => {
    const media = document.createElement('audio');
    vi.spyOn(media, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(media, 'pause').mockImplementation(() => {});
    await playAudioExcerpt(media, [
        { startSeconds: 1, endSeconds: 2 },
        { startSeconds: 9, endSeconds: 10 },
    ]);

    expect(media.currentTime).toBe(1);
    media.currentTime = 2;
    media.dispatchEvent(new Event('timeupdate'));
    expect(media.currentTime).toBe(9);
    media.currentTime = 10;
    media.dispatchEvent(new Event('timeupdate'));
    expect(pause).toHaveBeenCalledOnce();
});
