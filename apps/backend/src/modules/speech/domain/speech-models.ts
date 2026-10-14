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

export const KIE_GEMINI_MODEL = 'google/gemini-3-8-flash-lite-tts' as const;
export const GEMINI_PRONUNCIATION_SETTINGS_VERSION =
    'gemini-pronunciation-1' as const;

/** Names are synthesis policy metadata, independent of editable interface display labels. */
export const GEMINI_PRONUNCIATION_LANGUAGE_NAMES: Readonly<
    Record<string, string>
> = Object.freeze({
    ar: 'Arabic',
    de: 'German',
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    he: 'Hebrew',
    hi: 'Hindi',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    pl: 'Polish',
    pt: 'Portuguese',
    ru: 'Russian',
    tr: 'Turkish',
    zh: 'Chinese (Simplified)',
});

/** A reviewed subset of Kie's preset tutor voices; never accepts cloning inputs. */
export const GEMINI_TUTOR_VOICES = Object.freeze([
    'Bodi',
    'Lumi',
    'Sadaltager',
    'Sola',
    'Sulafat',
    'Varo',
    'Zephyr',
]);

export interface SpeechModelDefinition {
    readonly providerId: string;
    readonly modelId: string;
    readonly languageCodes: Readonly<Record<string, string>>;
    readonly voices: readonly string[] | null;
    readonly settingsVersions: readonly string[] | null;
    readonly defaultSettingsVersion: string;
    readonly maxCharacters: number;
}

/** Closed reviewed definitions shared by configuration and customer tariff discovery. */
export const SPEECH_MODEL_CATALOG: readonly SpeechModelDefinition[] =
    Object.freeze([
        Object.freeze({
            providerId: 'fixture',
            modelId: 'tone-v1',
            languageCodes: Object.freeze({}),
            voices: Object.freeze(['fixture']),
            settingsVersions: Object.freeze(['1']),
            defaultSettingsVersion: '1',
            maxCharacters: 2000,
        }),
        Object.freeze({
            providerId: 'kie',
            modelId: KIE_TURBO_MODEL,
            languageCodes: KIE_TURBO_LANGUAGE_CODES,
            voices: null,
            // Existing immutable operator profile revisions remain valid for recovery.
            settingsVersions: null,
            defaultSettingsVersion: '1',
            maxCharacters: 2000,
        }),
        // Kie: https://docs.kie.ai/market/google/gemini-3-8-flash-lite-tts
        // Language intersection checked against the exact 3.8 Flash-Lite table:
        // https://ai.google.dev/gemini-api/docs/speech-generation#supported-languages
        // Ukrainian is absent from that table; upstream support is not assumed.
        Object.freeze({
            providerId: 'kie',
            modelId: KIE_GEMINI_MODEL,
            languageCodes: Object.freeze({
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
                'zh-Hans': 'zh',
            }),
            voices: GEMINI_TUTOR_VOICES,
            settingsVersions: Object.freeze([
                GEMINI_PRONUNCIATION_SETTINGS_VERSION,
            ]),
            defaultSettingsVersion: GEMINI_PRONUNCIATION_SETTINGS_VERSION,
            maxCharacters: 2000,
        }),
    ]);

export function findSpeechModel(
    providerId: string,
    modelId: string,
): SpeechModelDefinition | undefined {
    return SPEECH_MODEL_CATALOG.find(
        (model) => model.providerId === providerId && model.modelId === modelId,
    );
}
