import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkbookDetail } from '@/fsd/pages/workbooks/ui/workbook-detail/workbook-detail';
const state = vi.hoisted(() => ({
    model: {
        workbook: {
            id: 'workbook',
            title: 'Workbook',
            version: 1,
            shared: false,
            notes: [
                { id: 'saved', title: 'Saved note', status: 'saved' },
                { id: 'draft', title: 'Draft note', status: 'draft' },
            ],
        },
        query: { isPending: false, isError: false, refetch: vi.fn() },
        busy: false,
        error: false,
        shareLink: '',
        copy: vi.fn(),
    },
}));
vi.mock('@/fsd/pages/workbooks/hooks/use-workbook-detail', () => ({
    useWorkbookDetail: () => state.model,
}));
vi.mock('@/fsd/shared/i18n', () => ({
    useI18n: () => ({ locale: 'en', href: (path: string) => path }),
}));
vi.mock('@/fsd/pages/workbooks/ui/workbook-detail/workbook-membership', () => ({
    WorkbookMembership: () => null,
}));
vi.mock('@/fsd/pages/workbooks/ui/workbook-detail/workbook-reader', () => ({
    WorkbookReader: () => null,
}));
vi.mock('@/fsd/pages/workbooks/ui/workbook-detail/workbook-note-row', () => ({
    WorkbookNoteRow: () => null,
}));
vi.mock(
    '@/fsd/pages/workbooks/ui/workbook-progress-summary/workbook-progress-summary',
    () => ({ WorkbookProgressSummary: () => null }),
);
beforeEach(() => {
    vi.clearAllMocks();
    state.model.workbook.notes = [
        { id: 'saved', title: 'Saved note', status: 'saved' },
        { id: 'draft', title: 'Draft note', status: 'draft' },
    ];
});
it('explains why the whole owner copy is blocked rather than silently losing a draft member', () => {
    render(<WorkbookDetail workbookId='workbook' />);
    expect(
        screen.getByText('Save all notes before copying this workbook.'),
    ).toBeInTheDocument();
    const copy = screen.getByRole('button', {
        name: 'Copy workbook',
        exact: true,
    });
    expect(copy).toBeDisabled();
    fireEvent.click(copy);
    expect(state.model.copy).not.toHaveBeenCalled();
});
it('enables copying after every member has saved material', () => {
    state.model.workbook.notes = [
        { id: 'saved', title: 'Saved note', status: 'saved' },
    ];
    render(<WorkbookDetail workbookId='workbook' />);
    expect(
        screen.queryByText('Save all notes before copying this workbook.'),
    ).not.toBeInTheDocument();
    const copy = screen.getByRole('button', {
        name: 'Copy workbook',
        exact: true,
    });
    expect(copy).toBeEnabled();
    fireEvent.click(copy);
    expect(state.model.copy).toHaveBeenCalledOnce();
});
