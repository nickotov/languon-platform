import { screen, fireEvent, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { KnowledgeWorkspace } from '@languon/contracts';
import type { KnowledgeEditorHandle } from '../src/fsd/features/knowledge-notes';
import { WorkspaceConflictDialogs } from '../src/fsd/pages/knowledge/ui/knowledge-detail-page/workspace-conflict-dialogs';
import { render } from './render';

function setup(
    result: 'applied' | 'invalid' = 'applied',
    format: 'markdown' | 'plain-text' = 'markdown',
) {
    const onCloseProposal = vi.fn();
    const onNewTarget = vi.fn();
    const applyProposal = vi.fn(() => result);
    const editor = {
        current: {
            applyProposal,
            getSnapshot: vi.fn(),
            restoreTarget: vi.fn(),
            getProposalPreview: vi.fn(),
            getProposalPosition: vi.fn(),
            showTarget: vi.fn(),
            getTargetComparison: vi.fn(() => ({
                original: 'Old',
                current: 'Changed',
            })),
        } satisfies KnowledgeEditorHandle,
    };
    const workspace = {
        noteId: 'note',
        status: 'draft',
        published: null,
        branches: [],
        preferredBranchId: 'branch',
        shareEnabled: false,
        limits: { referenceChars: 40000, editorChars: 40000 },
    } satisfies KnowledgeWorkspace;
    render(
        <WorkspaceConflictDialogs
            workspace={workspace}
            selectedBranchId='branch'
            onChoose={vi.fn()}
            onSaveCopy={vi.fn()}
            onResolve={vi.fn()}
            resolving={false}
            proposal={{
                text: '**New wording**',
                action: 'replace',
                targetId: 'old-target',
                format,
            }}
            editor={editor}
            onCloseProposal={onCloseProposal}
            onNewTarget={onNewTarget}
        />,
    );
    const dialog = screen.getByRole('dialog', {
        name: 'The proposal target changed',
        exact: true,
    });
    return { dialog, applyProposal, onCloseProposal, onNewTarget };
}

it('conflict append retains the explicit literal format and closes only after success', () => {
    const { dialog, applyProposal, onCloseProposal } = setup(
        'applied',
        'plain-text',
    );
    expect(dialog).toHaveTextContent('**New wording**');
    fireEvent.click(
        within(dialog).getByRole('button', {
            name: 'Append to the end',
            exact: true,
        }),
    );
    expect(applyProposal).toHaveBeenCalledWith(
        '**New wording**',
        'append',
        undefined,
        'plain-text',
    );
    expect(onCloseProposal).toHaveBeenCalledTimes(1);
});

it('keeps the conflict visible and reports an atomic insertion failure', () => {
    const { dialog, onCloseProposal } = setup('invalid');
    expect(dialog.querySelector('strong')).toHaveTextContent('New wording');
    fireEvent.click(
        within(dialog).getByRole('button', {
            name: 'Append to the end',
            exact: true,
        }),
    );
    expect(onCloseProposal).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent('your document has not changed');
});

it('passes the selected literal format to new-target recovery', () => {
    const { dialog, onNewTarget } = setup();
    fireEvent.click(
        within(dialog).getByRole('checkbox', {
            name: 'Insert as plain text',
            exact: true,
        }),
    );
    fireEvent.click(
        within(dialog).getByRole('button', {
            name: 'Choose a new target',
            exact: true,
        }),
    );
    expect(onNewTarget).toHaveBeenCalledWith('plain-text');
});
