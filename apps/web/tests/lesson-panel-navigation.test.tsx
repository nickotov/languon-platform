import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PanelPage } from '../src/fsd/shared/ui/panel-page/panel-page';
import { PanelPageHost } from '../src/fsd/shared/ui/panel-page-host/panel-page-host';
import { Tooltip } from '../src/fsd/shared/ui/tooltip/tooltip';
import { render } from './render';

function Workspace() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <textarea aria-label='Lesson document' />
            <PanelPageHost>
                <div data-testid='conversation'>
                    <textarea aria-label='Message' />
                    <Tooltip content='Send' open>
                        <button>Send message</button>
                    </Tooltip>
                    <button onClick={() => setOpen(true)}>Review lesson</button>
                    {open && (
                        <PanelPage
                            title='Preview'
                            backLabel='Back to chat'
                            onBack={() => setOpen(false)}
                        >
                            Lesson content
                        </PanelPage>
                    )}
                </div>
            </PanelPageHost>
        </>
    );
}

it('moves the preview outside the conversation, keeps the document reachable, and returns to the same chat draft and trigger', async () => {
    render(<Workspace />);
    const conversation = screen.getByTestId('conversation');
    const draft = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(draft, { target: { value: 'Continue here' } });
    conversation.scrollTop = 125;
    const opener = screen.getByRole('button', { name: 'Review lesson' });
    opener.focus();
    fireEvent.click(opener);
    const review = screen.getByRole('region', { name: 'Preview' });
    expect(conversation).not.toContainElement(review);
    expect(screen.getByText('Send').closest('[data-panel-overlay-root]')).toBe(
        conversation.parentElement,
    );

    expect(screen.getByRole('heading', { name: 'Preview' })).toHaveFocus();
    const editor = screen.getByRole('textbox', { name: 'Lesson document' });
    editor.focus();
    expect(editor).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
    expect(review).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBe(draft);
    expect(draft).toHaveValue('Continue here');
    expect(conversation.scrollTop).toBe(125);
    await waitFor(() => expect(opener).toHaveFocus());
});
