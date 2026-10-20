import { screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceAssistantProps } from '../src/fsd/widgets/contextual-assistant';
import { WorkspaceProposal } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/workspace-proposal';
import { render } from './render';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';

const originalText = 'The old wording';
const anchor = {
    from: 0,
    to: originalText.length,
    originalText,
    documentHash: 'a'.repeat(64),
};
const emptyPreview = {
    original: '',
    current: '',
    before: '',
    after: '',
    end: 'Current document end',
    changed: false,
};

function workspace(
    restoreTarget: WorkspaceAssistantProps['restoreTarget'],
): WorkspaceAssistantProps {
    return {
        getSnapshot: () => ({ content: originalText, editorTarget: anchor }),
        onAcceptProposal: vi.fn(() => 'applied'),
        restoreTarget,
        getProposalPreview: (targetId) =>
            targetId
                ? {
                      ...emptyPreview,
                      original: originalText,
                      current: originalText,
                  }
                : emptyPreview,
        onShowTarget: vi.fn(),
    };
}

beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
    });
});
afterEach(() =>
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'),
);

it('restores a persisted anchor for its preview and Show target without accepting a proposal', async () => {
    const user = userEvent.setup();
    const restore = vi.fn(async () => 'restored-target');
    const context = workspace(restore);
    const accept = vi.fn(async () => 'applied' as const);
    render(
        <WorkspaceProposal
            content='Proposed wording'
            turnId='turn-1'
            anchor={anchor}
            onAccept={accept}
            workspace={context}
        />,
    );
    const trigger = screen.getByRole('button', { name: 'Use in document' });
    await user.click(trigger);
    expect(
        await screen.findByRole('button', { name: 'Show target' }),
    ).toBeVisible();
    expect(screen.getByText('The 15 characters you selected')).toBeVisible();
    expect(
        within(
            screen.getByRole('region', { name: 'Use tutor reply in document' }),
        ).getByText(originalText),
    ).toBeVisible();
    expect(
        screen.queryByText('You didn’t select a passage for this question'),
    ).toBeNull();
    expect(restore).toHaveBeenCalledWith(anchor);
    expect(accept).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Show target' }));
    expect(context.onShowTarget).toHaveBeenCalledWith('restored-target');
    await user.click(
        screen.getByRole('button', { name: 'Cancel', exact: true }),
    );
    expect(trigger).toHaveFocus();
});

it('keeps the persisted original passage visible when changed content prevents restoration', async () => {
    const user = userEvent.setup();
    const context = workspace(vi.fn(async () => null));
    const accept = vi.fn(async () => 'missing' as const);
    render(
        <WorkspaceProposal
            content='Proposed wording'
            turnId='turn-1'
            anchor={anchor}
            onAccept={accept}
            workspace={context}
        />,
    );
    await user.click(screen.getByRole('button', { name: 'Use in document' }));
    await waitFor(() =>
        expect(
            screen.getByRole('button', { name: 'Replace', exact: true }),
        ).toBeEnabled(),
    );
    expect(screen.getByText('The 15 characters you selected')).toBeVisible();
    expect(
        within(
            screen.getByRole('region', { name: 'Use tutor reply in document' }),
        ).getByText(originalText),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show target' })).toBeNull();
    expect(accept).not.toHaveBeenCalled();
});

it('shows only one proposal review when choosing between two tutor replies', async () => {
    function Replies() {
        const [reviewingProposalId, onReviewingProposal] = useState<
            string | null
        >(null);
        const accept = vi.fn(async () => 'applied' as const);
        return (
            <>
                <WorkspaceProposal
                    proposalId='first'
                    reviewingProposalId={reviewingProposalId}
                    onReviewingProposal={onReviewingProposal}
                    content='First proposal'
                    turnId='first'
                    onAccept={accept}
                />
                <WorkspaceProposal
                    proposalId='second'
                    reviewingProposalId={reviewingProposalId}
                    onReviewingProposal={onReviewingProposal}
                    content='Second proposal'
                    turnId='second'
                    onAccept={accept}
                />
            </>
        );
    }
    const user = userEvent.setup();
    render(<Replies />);
    const triggers = screen.getAllByRole('button', { name: 'Use in document' });
    await user.click(triggers[0]!);
    expect(
        within(
            screen.getByRole('region', { name: 'Use tutor reply in document' }),
        ).getByText('First proposal'),
    ).toBeVisible();
    await user.click(triggers[1]!);
    expect(
        within(
            screen.getByRole('region', { name: 'Use tutor reply in document' }),
        ).queryByText('First proposal'),
    ).toBeNull();
    expect(
        within(
            screen.getByRole('region', { name: 'Use tutor reply in document' }),
        ).getByText('Second proposal'),
    ).toBeVisible();
    expect(
        screen.getAllByRole('region', { name: 'Use tutor reply in document' }),
    ).toHaveLength(1);
});

it('requires explicit acceptance for inline edits and falls back to comparison if the tracked passage changes', async () => {
    const user = userEvent.setup();
    const accept = vi.fn(async () => 'applied' as const);
    let changed = false;
    const context = {
        ...workspace(vi.fn(async () => 'target')),
        inlineProposalRootId: 'inline-root',
        proposalRootId: 'review-root',
        getProposalPosition: () =>
            changed ? null : { top: 100, left: 0, width: 600 },
        getProposalPreview: () => ({
            ...emptyPreview,
            original: originalText,
            current: changed ? 'My newer wording' : originalText,
            changed,
        }),
    };
    const content = (
        <>
            <div id='inline-root' />
            <div id='review-root' />
            <WorkspaceProposal
                content='Proposed wording'
                turnId='turn-1'
                anchor={anchor}
                targetId='target'
                onAccept={accept}
                workspace={context}
                rootId='review-root'
            />
        </>
    );
    const view = render(content);
    await user.click(screen.getByRole('button', { name: 'Show in text' }));
    const inline = screen.getByRole('region', {
        name: 'Use tutor reply in document',
    });
    expect(inline.parentElement?.id).toBe('inline-root');
    expect(accept).not.toHaveBeenCalled();
    changed = true;
    view.rerender(
        <I18nProvider locale='en' messages={en}>
            <div id='inline-root' />
            <div id='review-root' />
            <WorkspaceProposal
                content='Proposed wording'
                turnId='turn-1'
                anchor={anchor}
                targetId='target'
                onAccept={accept}
                workspace={context}
                rootId='review-root'
            />
        </I18nProvider>,
    );
    const review = screen.getByRole('region', {
        name: 'Use tutor reply in document',
    });
    expect(review.parentElement?.id).toBe('review-root');
    expect(within(review).getByText('My newer wording')).toBeVisible();
    expect(accept).not.toHaveBeenCalled();
});

it('keeps inline intent while a persisted target is being restored asynchronously', async () => {
    const user = userEvent.setup();
    let resolve!: (targetId: string) => void;
    const context = {
        ...workspace(
            () =>
                new Promise((restored) => {
                    resolve = restored;
                }),
        ),
        inlineProposalRootId: 'restored-inline-root',
        proposalRootId: 'restored-review-root',
        getProposalPosition: (targetId?: string) =>
            targetId ? { top: 100, left: 0, width: 600 } : null,
    };
    const accept = vi.fn(async () => 'applied' as const);
    render(
        <>
            <div id='restored-inline-root' />
            <div id='restored-review-root' />
            <WorkspaceProposal
                content='Restored inline edit'
                turnId='persisted-turn'
                anchor={anchor}
                onAccept={accept}
                workspace={context}
                rootId='restored-review-root'
            />
        </>,
    );
    await user.click(screen.getByRole('button', { name: 'Show in text' }));
    expect(
        screen.getByRole('button', { name: 'Replace', exact: true }),
    ).toBeDisabled();
    await act(async () => resolve('restored-target'));
    await waitFor(() =>
        expect(
            screen.getByRole('region', { name: 'Use tutor reply in document' })
                .parentElement?.id,
        ).toBe('restored-inline-root'),
    );
    expect(accept).not.toHaveBeenCalled();
});
