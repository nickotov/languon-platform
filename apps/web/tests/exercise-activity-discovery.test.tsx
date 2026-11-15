import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormEvent } from 'react';
import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from '@testing-library/react';
import {
    ExerciseActivityBrowser,
    ExerciseActivityPreview,
} from '../src/fsd/entities/learning-blocks';

afterEach(cleanup);

describe('contextual exercise discovery', () => {
    it('keeps preview independent of selection and searches all catalog activities', () => {
        const choose = vi.fn();
        const preview = vi.fn();
        render(
            <ExerciseActivityBrowser
                locale='en'
                onChoose={choose}
                onPreview={preview}
            />,
        );

        expect(screen.getAllByRole('button')).toHaveLength(38);
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Preview exercise: Choose the meaning',
            }),
        );

        expect(preview).toHaveBeenCalledWith('V02');
        expect(choose).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('Search exercises'), {
            target: { value: 'V02' },
        });

        expect(screen.getAllByRole('button')).toHaveLength(2);
        fireEvent.click(
            screen.getByRole('button', { name: /^V02 Choose the meaning/ }),
        );

        expect(choose).toHaveBeenCalledWith('V02');
        fireEvent.change(screen.getByLabelText('Search exercises'), {
            target: { value: 'missing' },
        });

        expect(screen.getByRole('status')).toHaveTextContent(
            'No matching exercises',
        );
    });

    it('runs prepared checking locally and resets without a generation action', () => {
        render(
            <ExerciseActivityPreview
                locale='en'
                activityId='V02'
                open
                onClose={vi.fn()}
            />,
        );

        const dialog = within(
            screen.getByRole('dialog', { name: 'V02 · Choose the meaning' }),
        );

        expect(dialog.getByText(/no AI or credits/)).toBeInTheDocument();
        fireEvent.click(
            dialog.getByRole('radio', { name: 'Give something back' }),
        );

        fireEvent.click(dialog.getByRole('button', { name: 'Check answer' }));
        expect(dialog.getAllByText('Correct').length).toBeGreaterThan(0);
        fireEvent.click(dialog.getByRole('button', { name: 'Reset example' }));
        expect(
            dialog.getByRole('radio', { name: 'Give something back' }),
        ).not.toBeChecked();

        expect(
            dialog.queryByRole('button', { name: 'Check with AI' }),
        ).not.toBeInTheDocument();
    });

    it('shows preset feedback separately from an arbitrary typed response', () => {
        render(
            <ExerciseActivityPreview
                locale='en'
                activityId='R04'
                open
                onClose={vi.fn()}
            />,
        );

        const dialog = within(
            screen.getByRole('dialog', {
                name: 'R04 · Answer in your own words',
            }),
        );

        fireEvent.change(dialog.getByRole('textbox'), {
            target: { value: 'My own response' },
        });

        fireEvent.click(
            dialog.getByRole('button', { name: 'Show sample feedback' }),
        );

        expect(
            dialog.getByText(/prepared feedback applies only/),
        ).toBeInTheDocument();

        expect(dialog.getByRole('textbox')).toHaveValue('My own response');
        expect(
            dialog.queryByRole('button', { name: 'Check with AI' }),
        ).not.toBeInTheDocument();
    });

    it('keeps preview checks outside a sendable composer form and isolates portal submits', () => {
        const submit = vi.fn((event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
        });
        const errors = vi.spyOn(console, 'error');

        render(
            <form aria-label='Chat composer' onSubmit={submit}>
                <textarea
                    aria-label='Message'
                    defaultValue='Generate an exercise'
                />
                <button type='submit'>Send</button>
                <ExerciseActivityPreview
                    locale='en'
                    activityId='V02'
                    open
                    onClose={vi.fn()}
                />
            </form>,
        );

        const composer = screen.getByRole('form', { name: 'Chat composer' });
        const dialog = screen.getByRole('dialog', {
            name: 'V02 · Choose the meaning',
        });

        expect(composer.contains(dialog)).toBe(false);
        expect(document.querySelector('form form')).toBeNull();
        fireEvent.click(
            within(dialog).getByRole('radio', { name: 'Give something back' }),
        );

        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Check answer' }),
        );

        expect(within(dialog).getAllByText('Correct').length).toBeGreaterThan(
            0,
        );

        expect(submit).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();

        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        expect(submit).toHaveBeenCalledOnce();
    });
});
