import {
    render as testingLibraryRender,
    type RenderOptions,
} from '@testing-library/react';
import type { ReactElement } from 'react';

import { I18nProvider, type Locale } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { es } from '@/fsd/shared/i18n/messages/es';
import { fr } from '@/fsd/shared/i18n/messages/fr';
import { ru } from '@/fsd/shared/i18n/messages/ru';

const catalogs = { en, es, fr, ru };

export function render(
    ui: ReactElement,
    options?: RenderOptions & { locale?: Locale },
) {
    const { locale = 'en', ...renderOptions } = options ?? {};
    return testingLibraryRender(
        <I18nProvider locale={locale} messages={catalogs[locale]}>
            {ui}
        </I18nProvider>,
        renderOptions,
    );
}
