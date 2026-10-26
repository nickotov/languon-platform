import { QueryClient } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortraitManagement } from '@/fsd/pages/learner-portrait/hooks/use-portrait-management';
import { PortraitIntroPage } from '@/fsd/pages/learner-portrait/ui/intro-page/intro-page';
import { PortraitOverviewPage } from '@/fsd/pages/learner-portrait/ui/overview-page/overview-page';
import { portraitCopy } from '@/fsd/pages/learner-portrait/lib/copy';
import { render } from './render';

const mocks = vi.hoisted(() => ({
    management: null as PortraitManagement | null,
}));
vi.mock('@/fsd/pages/learner-portrait/hooks/use-portrait-management', () => ({
    usePortraitManagement: () => mocks.management,
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

const cases = [
    {
        locale: 'en',
        provider:
            /current interview and any approved portrait.*provider it chooses.*approved fallback.*same answers and context/,
        active: /transcript and draft from active Languon application data/,
        boundary: /do not guarantee erasure.*model providers or in backups/,
        owner: /private to your account within Languon/,
    },
    {
        locale: 'ru',
        provider:
            /текущее интервью и утверждённый портрет.*выбранному приложением поставщику ИИ.*резервный сервис.*те же ответы и контекст/,
        active: /переписку интервью и черновик из активных данных приложения Languon/,
        boundary:
            /не гарантирует стирание.*поставщиков моделей или в резервных копиях/,
        owner: /В Languon портрет доступен только в вашем аккаунте/,
    },
    {
        locale: 'fr',
        provider:
            /l’entretien en cours et tout portrait approuvé.*choisi par l’application.*secours approuvé.*mêmes réponses et le même contexte/,
        active: /transcription et le brouillon des données actives de l’application Languon/,
        boundary:
            /ne garantissent pas l’effacement.*fournisseurs de modèles ou dans les sauvegardes/,
        owner: /Dans Languon, votre portrait est privé à votre compte/,
    },
    {
        locale: 'es',
        provider:
            /la entrevista actual y cualquier perfil aprobado.*elegido por la aplicación.*alternativo aprobado.*mismas respuestas y el mismo contexto/,
        active: /transcripción y el borrador de los datos activos de la aplicación Languon/,
        boundary:
            /no garantizan el borrado.*proveedores de modelos ni en copias de seguridad/,
        owner: /En Languon, tu perfil es privado dentro de tu cuenta/,
    },
] as const;

beforeEach(() => {
    mocks.management = {
        ownerId: 'portrait-fixture-owner',
        client: new QueryClient(),
        query: {
            isPending: false,
            isError: false,
            data: {
                version: 0,
                approvedVersion: 0,
                generation: 0,
                useEnabled: false,
                approved: null,
                draft: null,
            },
        },
        status: {
            isPending: false,
            isError: false,
            data: { interview: null, creditsBypass: true },
        },
        pending: false,
        error: null,
        requestWithSession: vi.fn(),
    } as unknown as PortraitManagement;
});

describe('portrait privacy notice boundaries', () => {
    it.each(cases)(
        'shows provider disclosure before Start and bounds deletion in $locale',
        async ({ locale, provider, active, boundary }) => {
            render(<PortraitIntroPage />, { locale });
            const header = screen
                .getByRole('heading', { level: 1 })
                .closest('header')!;
            const notice = within(header).getByText(provider);
            const start = screen.getByRole('button', {
                name: portraitCopy(locale, 'start'),
            });
            expect(notice).toBeVisible();
            expect(
                notice.compareDocumentPosition(start) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).not.toBe(0);
            expect(mocks.management!.requestWithSession).not.toHaveBeenCalled();
            const summary = screen
                .getByText(portraitCopy(locale, 'data'))
                .closest('summary')!;
            await userEvent.click(summary);
            const details = summary.closest('details')!;
            expect(details).toHaveAttribute('open');
            expect(within(details).getByText(provider)).toBeVisible();
            expect(within(details).getByText(active)).toBeVisible();
            expect(within(details).getByText(boundary)).toBeVisible();
            expect(within(details).queryByRole('link')).not.toBeInTheDocument();
        },
    );

    it.each(cases)(
        'scopes overview privacy to the account within Languon in $locale',
        ({ locale, owner }) => {
            mocks.management!.query.data!.approved = {
                items: {
                    languages: [],
                    explanationLanguages: [],
                    goals: ['Travel'],
                    accommodations: [],
                    hobbies: [],
                },
                locale,
                summary: '',
                updatedAt: '2026-10-21T10:00:00.000Z',
            };
            render(<PortraitOverviewPage />, { locale });
            expect(screen.getByText(owner)).toBeVisible();
        },
    );
});
