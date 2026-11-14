import { describe, expect, it, vi } from 'vitest';
import type { Locale } from '@/fsd/shared/i18n';
import { guideUiCopy } from '../src/fsd/pages/workbook-guide/ui/copy';
import { generateMetadata as overviewMetadata } from '../src/app/workbook/page';
import { generateMetadata as exercisesMetadata } from '../src/app/workbook/exercises/page';

const request = vi.hoisted(() => ({ locale: 'en' as Locale }));
vi.mock('@/fsd/shared/i18n/server', () => ({
    getRequestI18n: async () => request,
}));

vi.mock('@/fsd/pages/workbook-guide', async () => {
    const { guideUiCopy } =
        await import('../src/fsd/pages/workbook-guide/ui/copy');

    return {
        guideUiCopy,
        WorkbookGuidePage: () => null,
        WorkbookExercisesPage: () => null,
    };
});

describe('public workbook guide metadata', () => {
    it.each(['en', 'ru', 'fr', 'es'] as const)(
        'uses request locale %s for both routes',
        async (locale) => {
            request.locale = locale;
            const copy = guideUiCopy(locale);
            await expect(overviewMetadata()).resolves.toEqual({
                title: copy.title,
                description: copy.intro,
            });

            await expect(exercisesMetadata()).resolves.toEqual({
                title: `${copy.chapter} · ${copy.title}`,
                description: copy.chapterIntro,
            });
        },
    );
});
