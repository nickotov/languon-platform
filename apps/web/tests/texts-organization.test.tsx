import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextDocument, TextFolder } from '@languon/contracts';
import { textsApi } from '@/fsd/entities/texts';
import { useSessionStore } from '@/fsd/entities/session';
import { MoveTextDialog, NewTextDialog } from '@/fsd/features/text-management';
import { render } from './render';
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const folderId = '123e4567-e89b-42d3-a456-426614174000';
const textId = '123e4567-e89b-42d3-a456-426614174001';
const shareId = '123e4567-e89b-42d3-a456-426614174002';
const folder: TextFolder = {
    id: folderId,
    name: 'Shared reading',
    description: null,
    lifecycle: 'active',
    version: 2,
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
    isShared: true,
    shareId,
    shareVersion: 3,
};
const document = {
    id: textId,
    folderId: null,
    title: 'A text',
    lifecycle: 'active',
    version: 4,
} as TextDocument;
const requestWithSession = <T,>(operation: (token: string) => Promise<T>) =>
    operation('token');
function mount(ui: React.ReactElement) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    );
}
beforeEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
    useSessionStore.setState({
        status: 'authenticated',
        user: { id: 'learner' } as NonNullable<
            ReturnType<typeof useSessionStore.getState>['user']
        >,
    });
    vi.spyOn(textsApi, 'listFolders').mockResolvedValue({
        data: [folder],
        nextCursor: null,
    });
});
describe('text organization', () => {
    it('defaults global creation to independent', async () => {
        const close = vi.fn();
        mount(
            <NewTextDialog
                open
                onClose={close}
                requestWithSession={requestWithSession}
            />,
        );
        expect(screen.getByLabelText('Destination')).toHaveValue('');
        await screen.findByRole('option', { name: folder.name });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(push).toHaveBeenCalledWith('/texts/new');
        expect(close).toHaveBeenCalled();
    });
    it('preselects the current folder and carries acknowledged sharing into creation', async () => {
        mount(
            <NewTextDialog
                open
                initialFolderId={folderId}
                onClose={vi.fn()}
                requestWithSession={requestWithSession}
            />,
        );
        await screen.findByRole('option', { name: folder.name });
        expect(screen.getByLabelText('Destination')).toHaveValue(folderId);
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(push).toHaveBeenCalledWith(
            `/texts/new?folderId=${folderId}&shareId=${shareId}&shareVersion=3`,
        );
    });
    it('requires shared destination acknowledgment and submits its version with text version', async () => {
        const moved = { ...document, folderId, version: 5 };
        const move = vi
            .spyOn(textsApi, 'moveText')
            .mockResolvedValue({ text: moved });
        const saved = vi.fn();
        mount(
            <MoveTextDialog
                document={document}
                onClose={vi.fn()}
                onSaved={saved}
                requestWithSession={requestWithSession}
            />,
        );
        await screen.findByRole('option', { name: folder.name });
        fireEvent.change(screen.getByLabelText('Destination'), {
            target: { value: folderId },
        });
        expect(
            screen.getByRole('button', { name: 'Move', exact: true }),
        ).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(
            screen.getByRole('button', { name: 'Move', exact: true }),
        );
        await waitFor(() => expect(saved).toHaveBeenCalledWith(moved));
        expect(move).toHaveBeenCalledWith('token', textId, {
            folderId,
            expectedVersion: 4,
            sharedFolderConfirmation: { shareId, shareVersion: 3 },
        });
    });
    it('moves out without a sharing acknowledgment and preserves the original on failure', async () => {
        const move = vi
            .spyOn(textsApi, 'moveText')
            .mockRejectedValue(new Error('Conflict'));
        const saved = vi.fn();
        mount(
            <MoveTextDialog
                document={{ ...document, folderId }}
                onClose={vi.fn()}
                onSaved={saved}
                requestWithSession={requestWithSession}
            />,
        );
        await screen.findByRole('option', { name: folder.name });
        fireEvent.change(screen.getByLabelText('Destination'), {
            target: { value: '' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Move', exact: true }),
        );
        await waitFor(() =>
            expect(move).toHaveBeenCalledWith('token', textId, {
                folderId: null,
                expectedVersion: 4,
            }),
        );
        expect(saved).not.toHaveBeenCalled();
        expect(document.folderId).toBeNull();
    });
});
