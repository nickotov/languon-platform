import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkbookMembership } from '@/fsd/pages/workbooks/ui/workbook-detail/workbook-membership';
import { workbookLabels } from '@/fsd/features/workbooks';
import type { useWorkbookDetail } from '@/fsd/pages/workbooks/hooks/use-workbook-detail';

const original = '11111111-1111-4111-8111-111111111111';
const added = '22222222-2222-4222-8222-222222222222';
function model(shared: boolean) {
    const setNotes = vi.fn().mockResolvedValue(true);
    return {
        setNotes,
        model: {
            busy: false,
            workbook: {
                shared,
                notes: [{ id: original, title: 'Existing', status: 'saved' }],
            },
            library: {
                data: {
                    pages: [
                        {
                            workspaces: [
                                { id: added, title: 'New note' },
                                { id: original, title: 'Existing' },
                            ],
                        },
                    ],
                },
                isPending: false,
                isError: false,
                hasNextPage: false,
            },
            setNotes,
        } as unknown as ReturnType<typeof useWorkbookDetail>,
    };
}
describe('workbook membership sharing notice', () => {
    it('requires acknowledgement before adding to a shared workbook', async () => {
        const state = model(true);
        render(
            <WorkbookMembership
                model={state.model}
                labels={workbookLabels('en')}
            />,
        );
        fireEvent.change(screen.getByRole('combobox'), {
            target: { value: added },
        });
        expect(
            screen.getByRole('button', { name: 'Add', exact: true }),
        ).toBeDisabled();
        expect(state.setNotes).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(
            screen.getByRole('button', { name: 'Add', exact: true }),
        );
        await waitFor(() =>
            expect(state.setNotes).toHaveBeenCalledWith(
                [original, added],
                true,
            ),
        );
        await waitFor(() =>
            expect(screen.getByRole('checkbox')).not.toBeChecked(),
        );
    });
    it('allows a private addition without claiming sharing acknowledgement', async () => {
        const state = model(false);
        render(
            <WorkbookMembership
                model={state.model}
                labels={workbookLabels('en')}
            />,
        );
        fireEvent.change(screen.getByRole('combobox'), {
            target: { value: added },
        });
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Add', exact: true }),
        );
        await waitFor(() =>
            expect(state.setNotes).toHaveBeenCalledWith(
                [original, added],
                false,
            ),
        );
    });
});
