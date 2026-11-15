import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useConversationComposerInput } from '../src/fsd/widgets/contextual-assistant/hooks/use-conversation-composer-input';

afterEach(cleanup);
it('blocks implicit form submission and textarea Enter while the context picker is open', () => {
    const send = vi.fn();
    function Composer({ contextOpen }: { contextOpen: boolean }) {
        const input = useConversationComposerInput({
            question: 'Generate an exercise',
            contextOpen,
            canSend: true,
            workspace: false,
            onQuestion: vi.fn(),
            onContext: vi.fn(),
            onSend: send,
        });

        return (
            <form aria-label='Chat draft' onSubmit={input.submit}>
                <textarea
                    ref={input.input}
                    aria-label='Your question'
                    onKeyDown={input.key}
                    defaultValue='Generate an exercise'
                />
                {contextOpen && <input aria-label='Search exercises' />}
                <button type='submit'>Send</button>
            </form>
        );
    }

    const { rerender } = render(<Composer contextOpen />);
    // Browser search-input Enter reaches this same outer submit event.
    fireEvent.submit(screen.getByRole('form', { name: 'Chat draft' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Your question' }), {
        key: 'Enter',
    });

    expect(send).not.toHaveBeenCalled();
    rerender(<Composer contextOpen={false} />);
    fireEvent.submit(screen.getByRole('form', { name: 'Chat draft' }));
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Your question' }), {
        key: 'Enter',
    });

    expect(send).toHaveBeenCalledTimes(2);
});
