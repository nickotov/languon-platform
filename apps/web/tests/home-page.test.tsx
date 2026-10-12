import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomePage } from '@/fsd/pages/home/ui/home-page';

import { render } from './render';

describe('home work-in-progress page', () => {
    it.each(['en', 'es', 'fr', 'ru'] as const)(
        'renders only WIP in %s',
        (locale) => {
            render(<HomePage />, { locale });
            expect(screen.getByRole('main')).toHaveTextContent(/^WIP$/);
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        },
    );
});
