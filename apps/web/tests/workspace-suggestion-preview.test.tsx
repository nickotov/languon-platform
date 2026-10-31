import { fireEvent, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { render } from './render';
import { WorkspaceProposal } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/workspace-proposal';

it('renders complete formatted proposals and previews without accepting or touching the captured target', async () => {
    const user = userEvent.setup();
    const accept = vi.fn();
    const restore = vi.fn();
    const inspect = vi.fn();
    const review = vi.fn();
    const parentEscape = vi.fn();
    const content = [
        '## Grammar',
        'Use **être** with *care*.',
        '- First example\n- Second example',
        'A long explanation. '.repeat(20),
        'Last section of a long proposal.',
    ].join('\n\n');
    render(
        <div onKeyDown={parentEscape}>
            <WorkspaceProposal
                content={content}
                onAccept={accept}
                onReview={review}
                targetId='captured-target'
                workspace={{
                    getSnapshot: () => ({ content: 'Original document' }),
                    getProposalPreview: inspect,
                    restoreTarget: restore,
                    onAcceptProposal: accept,
                }}
            />
        </div>,
    );
    const card = screen.getByRole('region', { name: 'Proposed' });
    expect(
        within(card).getByRole('heading', { name: 'Grammar' }),
    ).toBeVisible();
    expect(card.querySelector('strong')).toHaveTextContent('être');
    expect(within(card).getAllByRole('listitem')).toHaveLength(2);
    expect(card).not.toHaveTextContent('**');
    const eye = within(card).getByRole('button', { name: 'Preview content' });
    await user.click(eye);
    const dialog = screen.getByRole('dialog', { name: 'Preview content' });
    const document = within(dialog).getByRole('document', { name: 'Proposed' });
    expect(
        within(document).getByText('Last section of a long proposal.'),
    ).toBeVisible();
    expect(document.querySelector('strong')).toHaveTextContent('être');
    expect(
        document.querySelector('[contenteditable], input, textarea'),
    ).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Append' })).toBeNull();
    await user.click(
        within(dialog).getByRole('button', { name: 'Close', exact: true }),
    );
    await waitFor(() => expect(eye).toHaveFocus());
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(eye);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(parentEscape).not.toHaveBeenCalled();
    fireEvent(
        screen.getByRole('dialog'),
        new Event('cancel', { cancelable: true }),
    );
    await waitFor(() => expect(eye).toHaveFocus());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(accept).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    fireEvent.keyDown(eye, { key: 'Escape' });
    expect(parentEscape).toHaveBeenCalledOnce();
});

it('keeps hostile unsupported proposal source inert in the card and modal', async () => {
    const user = userEvent.setup();
    const accept = vi.fn();
    const content =
        '<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert(1))';
    render(<WorkspaceProposal content={content} onAccept={accept} />);
    const card = screen.getByRole('region', { name: 'Proposed' });
    expect(card.querySelector('img, script, iframe, a')).toBeNull();
    // The header's trusted eye icon is outside the source document.
    const source = within(card).getByRole('document', { name: 'Proposed' });
    expect(source.querySelector('img, script, iframe, a, svg')).toBeNull();
    expect(source).toHaveTextContent(content.replace(/\s+/gu, ' '));
    await user.click(
        within(card).getByRole('button', { name: 'Preview content' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Preview content' });
    const document = within(dialog).getByRole('document', { name: 'Proposed' });
    expect(document.querySelector('img, script, iframe, a, svg')).toBeNull();
    expect(document).toHaveTextContent(content.replace(/\s+/gu, ' '));
    expect(accept).not.toHaveBeenCalled();
});
