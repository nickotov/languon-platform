import { fireEvent, render, screen } from '@testing-library/react';
import type { TextFolder } from '@languon/contracts';
import { describe, expect, it, vi } from 'vitest';
import { FolderCard } from '@/fsd/pages/texts/ui/library-page/folder-card';
import { textsLibraryEn } from '@/fsd/shared/i18n/messages/texts-library';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/fsd/shared/i18n', () => ({
    useI18n: () => ({
        locale: 'en',
        href: (value: string) => value,
        t: (
            key: keyof typeof textsLibraryEn,
            values?: Record<string, unknown>,
        ) => {
            let label = textsLibraryEn[key] ?? key;
            for (const [name, value] of Object.entries(values ?? {}))
                label = label.replace(`{${name}}`, String(value));
            return label;
        },
    }),
}));
const folder: TextFolder = {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Reading',
    description: 'Stories and passages',
    lifecycle: 'active',
    version: 3,
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-15T12:00:00.000Z',
    textCount: 5,
    translatedCount: 2,
    isShared: true,
};
function actions() {
    return {
        onEdit: vi.fn(),
        onShare: vi.fn(),
        onArchive: vi.fn(),
        onRestore: vi.fn(),
    };
}
describe('folder card source controls', () => {
    it('shows real counts, shared state and reachable edit/share/archive actions', async () => {
        const callbacks = actions();
        render(<FolderCard folder={folder} pending={false} {...callbacks} />);
        expect(screen.getByRole('link', { name: 'Reading' })).toHaveAttribute(
            'href',
            `/texts/folders/${folder.id}`,
        );
        expect(screen.getByText('5 texts · 2 translated')).toBeInTheDocument();
        expect(screen.getByText('Shared link')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Actions for Reading' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Edit details' }),
        );
        expect(callbacks.onEdit).toHaveBeenCalledWith(folder);
        fireEvent.click(
            screen.getByRole('button', { name: 'Actions for Reading' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Share folder' }),
        );
        expect(callbacks.onShare).toHaveBeenCalledWith(folder);
        fireEvent.click(
            screen.getByRole('button', { name: 'Actions for Reading' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Archive folder' }),
        );
        expect(callbacks.onArchive).toHaveBeenCalledWith(folder);
    });
    it('keeps sharing disabled until a translated document exists', async () => {
        const callbacks = actions();
        render(
            <FolderCard
                folder={{ ...folder, translatedCount: 0 }}
                pending={false}
                {...callbacks}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Actions for Reading' }),
        );
        expect(
            await screen.findByRole('menuitem', {
                name: 'Share — translate a text first',
            }),
        ).toBeDisabled();
        expect(callbacks.onShare).not.toHaveBeenCalled();
    });
    it('offers restore for an archived folder and hides editing and sharing', async () => {
        const callbacks = actions();
        const archived = {
            ...folder,
            lifecycle: 'archived' as const,
            isShared: false,
        };
        render(<FolderCard folder={archived} pending={false} {...callbacks} />);
        fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
        expect(callbacks.onRestore).toHaveBeenCalledWith(archived);
        fireEvent.click(
            screen.getByRole('button', { name: 'Actions for Reading' }),
        );
        expect(
            await screen.findByRole('menuitem', { name: 'Restore folder' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Edit details' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Share folder' }),
        ).not.toBeInTheDocument();
    });
});
