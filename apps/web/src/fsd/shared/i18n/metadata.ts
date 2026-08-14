import type { Metadata } from 'next';

import type { MessageKey } from './messages/en';
import { getRequestI18n } from './server';

export async function localizedMetadata(
    titleKey: MessageKey,
): Promise<Metadata> {
    const { t } = await getRequestI18n();
    return { title: t(titleKey) };
}
