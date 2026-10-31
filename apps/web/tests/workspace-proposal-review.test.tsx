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

it('opens review in an editor root mounted after the saved reply', async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    const { container } = render(
        <WorkspaceProposal
            content='Proposed wording'
            turnId='turn-1'
            rootId='late-editor-review'
            onReview={onReview}
            onAccept={vi.fn(async () => 'applied' as const)}
        />,
    );
    const root = document.createElement('div');
    root.id = 'late-editor-review';
    container.append(root);
    await user.click(screen.getByRole('button', { name: 'Use in document' }));
    expect(onReview).toHaveBeenCalledOnce();
    expect(
        within(root).getByRole('region', {
            name: 'Use tutor reply in document',
        }),
    ).toBeVisible();
});

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

it('preserves H1 and explains deeper heading mapping in rich proposal review', async () => {
    const user = userEvent.setup();
    const accept = vi.fn(async () => 'applied' as const);
    render(
        <WorkspaceProposal
            content={
                '# French tenses\n\n**Present** and *past*\n\n- First\n- Second\n\n#### Minor details'
            }
            turnId='formatted'
            onAccept={accept}
        />,
    );
    await user.click(screen.getByRole('button', { name: 'Use in document' }));
    const review = screen.getByRole('region', {
        name: 'Use tutor reply in document',
    });
    expect(
        within(review).getByRole('heading', {
            level: 1,
            name: 'French tenses',
        }),
    ).toBeVisible();
    expect(
        within(review).getByRole('heading', {
            level: 3,
            name: 'Minor details',
        }),
    ).toBeVisible();
    expect(within(review).getByText('Present').tagName).toBe('STRONG');
    expect(within(review).getByText('past').tagName).toBe('EM');
    expect(within(review).getAllByRole('listitem')).toHaveLength(2);
    expect(
        within(review).getByText(/Heading levels are adapted/),
    ).toBeVisible();
    expect(
        review.querySelector('p p, p h1, p h2, p h3, p ul, ins p'),
    ).toBeNull();
    await user.click(
        within(review).getByRole('button', { name: 'Append', exact: true }),
    );
    expect(accept).toHaveBeenCalledWith(
        expect.any(String),
        'append',
        'formatted',
        undefined,
        undefined,
        'markdown',
    );
});

it('rejects unsupported formatting until the user explicitly chooses plain text', async () => {
    const user = userEvent.setup();
    const accept = vi.fn(async () => 'applied' as const);
    const content = '```js\nconst example = true;\n```';
    render(
        <WorkspaceProposal
            content={content}
            turnId='fallback'
            onAccept={accept}
        />,
    );
    await user.click(screen.getByRole('button', { name: 'Use in document' }));
    const review = screen.getByRole('region', {
        name: 'Use tutor reply in document',
    });
    const append = within(review).getByRole('button', {
        name: 'Append',
        exact: true,
    });
    expect(append).toBeDisabled();
    expect(
        within(review).getByText(/Formatted insertion is unavailable/),
    ).toBeVisible();
    await user.click(
        within(review).getByRole('checkbox', { name: 'Insert as plain text' }),
    );
    expect(append).toBeEnabled();
    expect(within(review).getByText('```js')).toBeVisible();
    await user.click(append);
    expect(accept).toHaveBeenCalledWith(
        content,
        'append',
        'fallback',
        undefined,
        undefined,
        'plain-text',
    );
});

it('keeps an invalid proposal open with an accurate error rather than claiming it applied', async () => {
    const user = userEvent.setup();
    const accept = vi.fn(async () => 'invalid' as const);
    render(
        <WorkspaceProposal
            content='**Proposed wording**'
            turnId='invalid'
            onAccept={accept}
        />,
    );
    await user.click(screen.getByRole('button', { name: 'Use in document' }));
    const review = screen.getByRole('region', {
        name: 'Use tutor reply in document',
    });
    await user.click(
        within(review).getByRole('button', { name: 'Append', exact: true }),
    );
    expect(review).toBeVisible();
    expect(within(review).getByRole('status')).toHaveTextContent(
        'The document would exceed its limits',
    );
    expect(
        screen.queryByText('Added to working draft. You can undo this edit.'),
    ).toBeNull();
});

it('routes unsupported inline content to full review without offering unguarded acceptance', async () => {
    const user = userEvent.setup();
    const accept = vi.fn(async () => 'applied' as const);
    const context = {
        ...workspace(vi.fn(async () => 'target')),
        inlineProposalRootId: 'invalid-inline-root',
        proposalRootId: 'invalid-review-root',
        getProposalPosition: () => ({ top: 100, left: 0, width: 600 }),
    };
    render(
        <>
            <div id='invalid-inline-root' />
            <div id='invalid-review-root' />
            <WorkspaceProposal
                content='![image](https://example.com/a.png)'
                anchor={anchor}
                targetId='target'
                turnId='inline-fallback'
                onAccept={accept}
                workspace={context}
                rootId='invalid-review-root'
            />
        </>,
    );
    await user.click(screen.getByRole('button', { name: 'Show in text' }));
    const review = screen.getByRole('region', {
        name: 'Use tutor reply in document',
    });
    expect(review.parentElement?.id).toBe('invalid-review-root');
    expect(
        within(review).getByRole('checkbox', { name: 'Insert as plain text' }),
    ).toBeVisible();
    expect(
        within(review).getByRole('button', { name: 'Replace', exact: true }),
    ).toBeDisabled();
    expect(accept).not.toHaveBeenCalled();
});

it('renders unsafe links literally with an explicit error and no active anchor', async () => {
    const user = userEvent.setup();
    render(
        <WorkspaceProposal
            content='[Open](javascript:alert(1))'
            turnId='unsafe'
            onAccept={vi.fn(async () => 'applied' as const)}
        />,
    );
    await user.click(screen.getByRole('button', { name: 'Use in document' }));
    const review = screen.getByRole('region', {
        name: 'Use tutor reply in document',
    });
    expect(
        within(review).getByText(/unsupported or unsafe link/),
    ).toBeVisible();
    expect(within(review).queryByRole('link')).toBeNull();
    expect(
        within(review).getByRole('button', { name: 'Append', exact: true }),
    ).toBeDisabled();
});

it('uses rich document rendering for inline suggestions without nesting paragraphs', async () => {
    const user = userEvent.setup();
    const context = {
        ...workspace(vi.fn(async () => 'target')),
        inlineProposalRootId: 'rich-inline-root',
        getProposalPosition: () => ({ top: 100, left: 0, width: 600 }),
    };
    render(
        <>
            <div id='rich-inline-root' />
            <WorkspaceProposal
                content='**New wording**'
                turnId='rich-inline'
                anchor={anchor}
                targetId='target'
                workspace={context}
                onAccept={vi.fn(async () => 'applied' as const)}
            />
        </>,
    );
    await user.click(screen.getByRole('button', { name: 'Show in text' }));
    const review = screen.getByRole('region', {
        name: 'Use tutor reply in document',
    });
    expect(review.parentElement?.id).toBe('rich-inline-root');
    expect(within(review).getByText('New wording').tagName).toBe('STRONG');
    expect(review.querySelector('p p, ins p')).toBeNull();
});

it('previews GFM tables and discloses alignment and link-title normalization', async () => {
    const user = userEvent.setup();
    const content =
        '| Tense | Example |\n| :--- | ---: |\n| Present | [Example](https://example.com "More information") |';
    render(
        <WorkspaceProposal
            content={content}
            turnId='table'
            onAccept={vi.fn(async () => 'applied' as const)}
        />,
    );
    await user.click(screen.getByRole('button', { name: 'Use in document' }));
    const review = screen.getByRole('region', {
        name: 'Use tutor reply in document',
    });
    expect(within(review).getByRole('table')).toBeVisible();
    expect(
        within(review).getByRole('link', { name: 'Example' }),
    ).toHaveAttribute('href', 'https://example.com');
    expect(
        within(review).getByText(
            /Table alignment and link tooltips are adapted/,
        ),
    ).toBeVisible();
    expect(
        within(review).getByRole('button', { name: 'Append', exact: true }),
    ).toBeEnabled();
});
