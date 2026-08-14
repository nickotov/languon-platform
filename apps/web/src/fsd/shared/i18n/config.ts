export const locales = ['en', 'ru', 'fr', 'es'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';
export const localeCookieName = 'languon-locale';

export function isLocale(value: string): value is Locale {
    return locales.includes(value as Locale);
}

export function preferredLocale(
    cookieValue: string | undefined,
    acceptLanguage: string | null,
): Locale {
    if (cookieValue && isLocale(cookieValue.toLowerCase())) {
        return cookieValue.toLowerCase() as Locale;
    }

    const preferences = (acceptLanguage?.split(',') ?? [])
        .map((preference, index) => {
            const [rawTag, ...parameters] = preference.split(';');
            const qualityParameter = parameters
                .map((parameter) => parameter.trim().toLowerCase())
                .find((parameter) => parameter.startsWith('q='));
            const parsedQuality = qualityParameter
                ? Number(qualityParameter.slice(2))
                : 1;
            return {
                index,
                quality:
                    Number.isFinite(parsedQuality) &&
                    parsedQuality >= 0 &&
                    parsedQuality <= 1
                        ? parsedQuality
                        : 0,
                tag: rawTag?.trim().toLowerCase(),
            };
        })
        .filter((preference) => preference.quality > 0)
        .sort(
            (left, right) =>
                right.quality - left.quality || left.index - right.index,
        );

    for (const preference of preferences) {
        const { tag } = preference;
        if (!tag || tag === '*') continue;
        const exact = locales.find((locale) => locale === tag);
        if (exact) return exact;
        const base = tag.split('-')[0];
        if (base && isLocale(base)) return base;
    }

    return defaultLocale;
}
