import { useRouter } from 'next/navigation';
import { useState, type KeyboardEvent } from 'react';
import { useNavigationResources } from '@/fsd/features/library-navigation';
import { useI18n } from '@/fsd/shared/i18n';
import { requestGuardedNavigation } from '@/fsd/shared/lib/navigation/guarded-navigation';
import { themeCookieName, useTheme } from '@/fsd/shared/theme';
import { navigationSections } from '../lib/navigation-sections';
import { useShellNavigation } from '../model/navigation-context';
import type { NavigationResource } from '@languon/contracts';

export type PaletteItem = {
    id: string;
    label: string;
    group: 'recent' | 'results' | 'actions';
    resource?: NavigationResource;
    run(): void;
};
export function usePalette(onClose: () => void) {
    const { href, t } = useI18n();
    const router = useRouter();
    const { requestWithSession, create } = useShellNavigation();
    const { preference, setPreference } = useTheme();
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const resources = useNavigationResources(
        { enabled: true, query, limit: 8, recent: true },
        requestWithSession,
    );
    function go(path: string) {
        requestGuardedNavigation(() => router.push(href(path)));
    }
    function toggleTheme() {
        const dark =
            preference === 'dark' ||
            (preference === 'system' &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);
        const next = dark ? 'light' : 'dark';
        setPreference(next);
        document.cookie = `${themeCookieName}=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
    }
    const items: PaletteItem[] = (resources.data?.resources ?? []).map(
        (resource) => ({
            id: `${resource.kind}-${resource.id}`,
            label: resource.title,
            resource,
            group: query.trim() ? 'results' : 'recent',
            run: () => go(resource.href),
        }),
    );
    const actions: PaletteItem[] = navigationSections.map((section) => ({
        id: `create-${section.kind}`,
        label: t(section.createLabel),
        group: 'actions',
        run: () => create(section.kind),
    }));
    actions.push(
        {
            id: 'settings',
            label: t('shell.settings'),
            group: 'actions',
            run: () => go('/profile'),
        },
        {
            id: 'theme',
            label: t('shell.toggleTheme'),
            group: 'actions',
            run: toggleTheme,
        },
    );
    const q = query.trim().toLocaleLowerCase();
    items.push(
        ...actions.filter(
            (action) => !q || action.label.toLocaleLowerCase().includes(q),
        ),
    );
    function run(item: PaletteItem) {
        onClose();
        item.run();
    }
    const selected =
        items[Math.max(0, Math.min(activeIndex, items.length - 1))];
    function select(id: string) {
        setActiveIndex(items.findIndex((item) => item.id === id));
    }
    function keyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, items.length - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === 'Enter' && selected) {
            event.preventDefault();
            run(selected);
        }
    }
    function changeQuery(value: string) {
        setQuery(value);
        setActiveIndex(0);
    }
    return {
        query,
        changeQuery,
        items,
        selected,
        resources,
        keyDown,
        run,
        select,
    };
}
