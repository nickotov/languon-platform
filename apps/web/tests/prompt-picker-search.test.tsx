import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PromptPicker } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/ui/prompt-picker/prompt-picker';

afterEach(cleanup);
function fixture() {
    render(
        <PromptPicker
            locale='en'
            blocks={[
                {
                    id: 'library',
                    type: 'vocabulary',
                    title: 'LibraryOnlyDictionary',
                },
            ]}
            texts={<p>Texts</p>}
            onExercise={vi.fn()}
            onBlock={vi.fn()}
            onPreview={vi.fn()}
            onClose={vi.fn()}
        />,
    );

    return screen.getByRole('textbox', { name: 'Search exercises and blocks' });
}

it('root search shows valid document matches without an exercise-only empty status', () => {
    const search = fixture();
    fireEvent.change(search, { target: { value: 'LibraryOnlyDictionary' } });
    expect(
        screen.getByRole('button', { name: 'LibraryOnlyDictionary' }),
    ).toBeVisible();

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('No matching exercises')).toBeNull();
});

it('root search reports one combined empty result while the exercise submenu retains its specific message', () => {
    const search = fixture();
    fireEvent.change(search, { target: { value: 'nothingmatches123' } });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(
        'No matching exercises or blocks',
    );

    fireEvent.change(search, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exercises' }));
    fireEvent.change(
        screen.getByRole('textbox', { name: 'Search exercises' }),
        { target: { value: 'nothingmatches123' } },
    );

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(
        'No matching exercises',
    );
});
