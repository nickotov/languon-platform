import {
    DictionaryLanguageTagSchema,
    type PortraitInterviewerOutput,
} from '@languon/contracts';
import type { InterviewLocale } from './interview-copy';

export const primaryInterviewLanguageTags = [
    'ru',
    'en',
    'fr',
    'es',
    'de',
    'sr',
    'pl',
] as const;

const interviewLanguageTags = [
    ...new Set<string>([
        ...primaryInterviewLanguageTags,
        ...DictionaryLanguageTagSchema.options,
        'hu',
        'nl',
        'sv',
        'no',
        'da',
        'fi',
        'cs',
        'sk',
        'ro',
        'bg',
        'el',
        'hr',
        'bs',
        'sl',
        'lt',
        'lv',
        'et',
        'sq',
        'ka',
        'hy',
        'fa',
        'ur',
        'bn',
        'ta',
        'te',
        'th',
        'vi',
        'id',
        'ms',
        'fil',
        'sw',
    ]),
];

type LanguageOption = PortraitInterviewerOutput['options'][number];

export function interviewLanguageOptions(
    locale: InterviewLocale,
    provided: LanguageOption[] = [],
) {
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    const remaining = new Set(provided);
    const options = interviewLanguageTags.map((tag) => {
        const label = names.of(tag) ?? tag;
        const supplied = [...remaining].find(
            (option) =>
                option.id === tag ||
                (!interviewLanguageTags.includes(option.id) &&
                    option.label.toLocaleLowerCase(locale) ===
                        label.toLocaleLowerCase(locale)),
        );
        if (supplied) remaining.delete(supplied);
        return supplied ?? { id: tag, label };
    });
    return [...options, ...remaining];
}
