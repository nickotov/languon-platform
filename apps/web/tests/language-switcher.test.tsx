import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageSwitcher } from '@/fsd/features/change-locale';

import { render } from './render';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh }),
}));

describe('LanguageSwitcher', () => {
    beforeEach(() => {
        refresh.mockReset();
        document.cookie = 'languon-locale=; Max-Age=0; Path=/';
        window.history.replaceState({}, '', '/login?returnTo=%2Fsecurity#form');
    });

    it('stores the choice and refreshes the unchanged route', async () => {
        const user = userEvent.setup();
        render(<LanguageSwitcher />, { locale: 'fr' });

        const selector = screen.getByRole('combobox', { name: 'Langue' });
        expect(selector).toHaveValue('fr');
        await user.selectOptions(selector, 'es');

        expect(refresh).toHaveBeenCalledOnce();
        expect(window.location.pathname).toBe('/login');
        expect(window.location.search).toBe('?returnTo=%2Fsecurity');
        expect(window.location.hash).toBe('#form');
        expect(document.cookie).toContain('languon-locale=es');
    });
});
