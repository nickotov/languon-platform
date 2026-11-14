import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { ExerciseExplorer } from '../src/fsd/pages/workbook-guide/ui/exercise-explorer/exercise-explorer';
import { guideActivities } from '../src/fsd/pages/workbook-guide/lib/examples';
import { PromptRecipe } from '../src/fsd/pages/workbook-guide/ui/prompt-recipe/prompt-recipe';
import { guideUiCopy } from '../src/fsd/pages/workbook-guide/ui/copy';

afterEach(cleanup);
const activities = guideActivities('en');
describe('workbook guide practice', () => {
    it('checks a prepared answer locally and clears it on reset and switch', () => {
        render(<ExerciseExplorer locale='en' activities={activities} />);
        const demo = within(screen.getByTestId('workbook-demo'));
        fireEvent.click(
            demo.getByRole('radio', { name: 'Give something back' }),
        );

        fireEvent.click(demo.getByRole('button', { name: 'Check answer' }));
        expect(demo.getAllByText('Correct').length).toBeGreaterThan(0);
        fireEvent.click(demo.getByRole('button', { name: 'Reset example' }));
        expect(
            demo.getByRole('radio', { name: 'Give something back' }),
        ).not.toBeChecked();

        fireEvent.change(screen.getByLabelText('Activity'), {
            target: { value: 'V07' },
        });

        expect(
            demo.queryByRole('button', { name: 'Check answer' }),
        ).not.toBeInTheDocument();

        expect(
            demo.queryByRole('button', { name: 'Check with AI' }),
        ).not.toBeInTheDocument();
    });

    it('keeps arbitrary typed answers separate from preset feedback', () => {
        render(
            <ExerciseExplorer
                locale='en'
                activities={activities}
                initialActivity='R04'
            />,
        );

        const demo = within(screen.getByTestId('workbook-demo'));
        fireEvent.change(demo.getByRole('textbox'), {
            target: { value: 'My arbitrary response' },
        });

        fireEvent.click(
            screen.getByRole('button', { name: 'Show sample feedback' }),
        );

        const panel = within(screen.getByTestId('sample-feedback'));
        expect(panel.getByText(/This prepared feedback/)).toBeInTheDocument();
        expect(
            demo.queryByText(
                'The response completes the task and preserves the source meaning.',
            ),
        ).not.toBeInTheDocument();

        expect(demo.getByRole('textbox')).toHaveValue('My arbitrary response');
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
