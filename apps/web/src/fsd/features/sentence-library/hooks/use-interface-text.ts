import { useI18n } from '@/fsd/shared/i18n';
import { tl, type LibraryKey } from '../lib/copy';
import { formatDate, languageLabel, type Vars } from '../lib/i18n-format';
export function useInterfaceText() {
    const { locale } = useI18n();
    const L = (key: LibraryKey, vars?: Vars) => tl(key, locale, vars);
    const lang = (code: string) => languageLabel(code, locale);
    const date = (iso: string) => formatDate(iso, locale);
    const direction = (from: string, to: string) =>
        L('dirLong', { from: lang(from), to: lang(to) });
    return { locale, L, lang, date, direction };
}
