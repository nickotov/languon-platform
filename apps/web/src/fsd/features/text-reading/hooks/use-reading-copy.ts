import { useI18n } from '@/fsd/shared/i18n';
import {
    textsReadingEn,
    textsReadingRu,
    textsReadingEs,
    textsReadingFr,
} from '@/fsd/shared/i18n/messages/texts-reading';
export function useReadingCopy() {
    const { locale } = useI18n();
    const catalogs: Record<
        string,
        Record<keyof typeof textsReadingEn, string>
    > = {
        en: textsReadingEn,
        ru: textsReadingRu,
        es: textsReadingEs,
        fr: textsReadingFr,
    };
    const messages = catalogs[locale] ?? textsReadingEn;
    return (
        key: keyof typeof textsReadingEn,
        values: Record<string, string | number> = {},
    ) =>
        messages[key]!.replace(/\{(\w+)\}/g, (token, name: string) =>
            String(values[name] ?? token),
        );
}
