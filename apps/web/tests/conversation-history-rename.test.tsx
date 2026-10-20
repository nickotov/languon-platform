import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationHistory } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/conversation-history';
import { render } from './render';

afterEach(cleanup);

it('keeps an edited conversation title after a failed save and retries it', async () => {
    const user = userEvent.setup();
    const rename = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce();
    render(
        <ConversationHistory
            id='00000000-0000-4000-8000-000000000001'
            options={[
                {
                    value: '00000000-0000-4000-8000-000000000001',
                    label: 'Original title',
                    date: 'Today',
                },
            ]}
            busy={false}
            onSelect={vi.fn()}
            onCreate={vi.fn()}
            onDelete={vi.fn()}
            onRename={rename}
            onBack={vi.fn()}
        />,
    );

    await user.click(
        screen.getByRole('button', {
            name: /Rename conversation: Original title/,
        }),
    );
    const input = screen.getByRole('textbox', { name: 'Rename conversation' });
    await user.clear(input);
    await user.type(input, 'My language research');
    await user.click(screen.getByRole('button', { name: 'Save title' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not save the title',
    );
    expect(input).toHaveValue('My language research');

    await user.click(screen.getByRole('button', { name: 'Save title' }));
    await waitFor(() => expect(rename).toHaveBeenCalledTimes(2));
    expect(rename).toHaveBeenNthCalledWith(
        2,
        '00000000-0000-4000-8000-000000000001',
        'My language research',
    );
    await waitFor(() =>
        expect(
            screen.queryByRole('textbox', { name: 'Rename conversation' }),
        ).toBeNull(),
    );
});
