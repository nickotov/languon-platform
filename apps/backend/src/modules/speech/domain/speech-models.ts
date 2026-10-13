/** Curated model capability, deliberately separate from configured voice availability. */
export const KIE_TURBO_MODEL = 'elevenlabs/text-to-speech-turbo-2-5' as const;
export const KIE_TURBO_LANGUAGE_CODES: Readonly<Record<string, string>> =
    Object.freeze({
        ar: 'ar',
        de: 'de',
        en: 'en',
        es: 'es',
        fr: 'fr',
        he: 'he',
        hi: 'hi',
        it: 'it',
        ja: 'ja',
        ko: 'ko',
        pl: 'pl',
        pt: 'pt',
        ru: 'ru',
        tr: 'tr',
        uk: 'uk',
        'zh-Hans': 'zh',
        zh: 'zh',
    });
