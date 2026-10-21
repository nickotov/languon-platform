import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
    AuthUser,
    PortraitState,
    StartPortraitInterviewResponse,
} from '@languon/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { portraitApi } from '@/fsd/entities/learner-portrait';
import { useSessionStore } from '@/fsd/entities/session';
import type { PortraitManagement } from '@/fsd/pages/learner-portrait/hooks/use-portrait-management';
import { RestartInterviewDialog } from '@/fsd/pages/learner-portrait/ui/editing-page/restart-interview-dialog';
import { DeletePortraitDialog } from '@/fsd/pages/learner-portrait/ui/delete-dialog/delete-dialog';
import { render } from './render';

const { push, toast } = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/fsd/shared/ui', async () => ({
    ...(await vi.importActual<object>('@/fsd/shared/ui')),
    showToast: toast,
}));
const ownerId = '10000000-0000-4000-8000-000000000001';
function fixture(): PortraitManagement {
    return {
        ownerId,
        query: { data: { version: 4 } },
        status: { data: { interview: { locale: 'fr' } } },
        client: new QueryClient(),
        pending: false,
        requestWithSession: <T,>(operation: (token: string) => Promise<T>) =>
            operation('fixture-token'),
        apply: vi.fn(),
    } as unknown as PortraitManagement;
}
beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: { id: ownerId } as AuthUser });
});

describe('portrait destructive confirmations', () => {
    it('keeps the transcript and draft when fresh interview confirmation is cancelled', async () => {
        const discard = vi.spyOn(portraitApi, 'discard');
        const start = vi.spyOn(portraitApi, 'startInterview');
        const close = vi.fn();
        render(
            <RestartInterviewDialog
                open
                onClose={close}
                management={fixture()}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(close).toHaveBeenCalledOnce();
        expect(discard).not.toHaveBeenCalled();
        expect(start).not.toHaveBeenCalled();
    });
    it('discards before restarting with the returned version and chosen interview language', async () => {
        const next: PortraitState = {
            version: 5,
            approvedVersion: 1,
            generation: 1,
            useEnabled: false,
            approved: null,
            draft: null,
        };
        vi.spyOn(portraitApi, 'discard').mockResolvedValue(next);
        vi.spyOn(portraitApi, 'startInterview').mockResolvedValue(
            {} as StartPortraitInterviewResponse,
        );
        render(
            <RestartInterviewDialog
                open
                onClose={vi.fn()}
                management={fixture()}
            />,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Start a fresh interview' }),
        );
        await waitFor(() =>
            expect(push).toHaveBeenCalledWith('/portrait/interview'),
        );
        expect(portraitApi.discard).toHaveBeenCalledWith('fixture-token', {
            expectedVersion: 4,
        });
        expect(portraitApi.startInterview).toHaveBeenCalledWith(
            'fixture-token',
            { expectedVersion: 5, locale: 'fr' },
        );
        expect(
            vi.mocked(portraitApi.discard).mock.invocationCallOrder[0],
        ).toBeLessThan(
            vi.mocked(portraitApi.startInterview).mock.invocationCallOrder[0]!,
        );
    });
    it('reports when discard succeeded but restart failed, without pretending the draft survives', async () => {
        vi.spyOn(portraitApi, 'discard').mockResolvedValue({
            version: 5,
            approvedVersion: 1,
            generation: 1,
            useEnabled: false,
            approved: null,
            draft: null,
        });
        vi.spyOn(portraitApi, 'startInterview').mockRejectedValue(
            new Error('Unavailable'),
        );
        render(
            <RestartInterviewDialog
                open
                onClose={vi.fn()}
                management={fixture()}
            />,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Start a fresh interview' }),
        );
        expect(
            await screen.findByText(
                /previous interview and draft were discarded/,
            ),
        ).toBeVisible();
        expect(push).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(push).toHaveBeenCalledWith('/portrait/intro?restart=failed');
    });
    it('does not delete or announce deletion when Delete dialog is cancelled', async () => {
        const management = fixture();
        const close = vi.fn();
        render(
            <DeletePortraitDialog
                open
                onClose={close}
                management={management}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(close).toHaveBeenCalledOnce();
        expect(management.apply).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });
});
