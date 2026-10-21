import { PortraitItemsSchema, type PortraitItems } from '@languon/contracts';
import { PortraitSensitiveContentError } from './errors';

export const PORTRAIT_INTERVIEW_INACTIVITY_MS = 14 * 24 * 60 * 60 * 1000;
export const portraitExpiry = (at: Date): string =>
    new Date(at.getTime() + PORTRAIT_INTERVIEW_INACTIVITY_MS).toISOString();
export function hasMeaningfulPortraitItems(items: PortraitItems): boolean {
    return (
        items.languages.length > 0 ||
        items.explanationLanguages.length > 0 ||
        items.mixedLanguage !== undefined ||
        items.mixedLanguageFrequency !== undefined ||
        items.mixingNote !== undefined ||
        (items.notes?.length ?? 0) > 0 ||
        items.goals.length > 0 ||
        items.tone !== undefined ||
        items.detail !== undefined ||
        items.wording !== undefined ||
        items.approach !== undefined ||
        items.accommodations.length > 0 ||
        items.hobbies.length > 0 ||
        (items.ageRange !== undefined && items.ageRange !== 'prefer-not-to-say')
    );
}
/**
 * Defense in depth for common volunteered labels in the four interface locales.
 * This rejects rather than rewrites disclosures: it neither diagnoses the learner
 * nor exhaustively recognizes unknown conditions, euphemisms or semantic claims.
 */
function normalizePortraitDisclosure(text: string): string {
    return text
        .normalize('NFKD')
        .replace(/[\p{M}\p{Cf}]/gu, '')
        .toLowerCase();
}
const disclosureSeparators = '[\\p{P}\\p{Z}\\p{S}\\s]*';
function disclosurePattern(
    terms: readonly string[],
    allowSuffix: boolean,
): RegExp {
    const alternatives = terms.map((term) =>
        Array.from(normalizePortraitDisclosure(term).replace(/\s+/gu, '')).join(
            disclosureSeparators,
        ),
    );
    return new RegExp(
        `(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})${allowSuffix ? '[\\p{L}]*' : ''}(?![\\p{L}\\p{N}])`,
        'u',
    );
}
// Longer stems cover grammatical variants; short acronyms require word boundaries.
// Generic words such as ADD, focus, stress and nervous are intentionally excluded.
const diagnosticLabel = disclosurePattern(
    [
        'depress',
        'depres',
        'anxiet',
        'anxious',
        'anxieux',
        'anxieuse',
        'ansiedad',
        'autis',
        'dyslex',
        'dislex',
        'dyscalcul',
        'discalcul',
        'dysgraph',
        'disgraf',
        'dysprax',
        'disprax',
        'bipolar',
        'schizoph',
        'schizof',
        'esquizof',
        'attention deficit',
        'deficit de lattention',
        'deficit de atencion',
        'diagnosed',
        'diagnosticad',
        'diagnostiqu',
        'диагноз',
        'диагностирован',
        'obsessive compulsive',
        'post traumatic stress',
        'panic disorder',
        'trouble panique',
        'trastorno de panico',
        'депресс',
        'тревожн',
        'аутиз',
        'аутист',
        'дислекс',
        'дискалькул',
        'дисграф',
        'диспрак',
        'биполяр',
        'шизофр',
        'дефицит внимания',
        'обсессивно компульсив',
        'посттравматическ',
        'паническое расстроиство',
        'epileps',
        'эпилепс',
        'diabet',
        'диабет',
        'asthma',
        'asthme',
        'астма',
    ],
    true,
);
const diagnosticAcronym = disclosurePattern(
    [
        'adhd',
        'ocd',
        'ptsd',
        'tdah',
        'toc',
        'tspt',
        'tept',
        'сдвг',
        'окр',
        'птср',
    ],
    false,
);
const selfDiagnosis = disclosurePattern(
    [
        'I was diagnosed',
        'I have been diagnosed',
        'I am diagnosed',
        'I self diagnosed',
        'my diagnosis',
        'мне поставили диагноз',
        'у меня диагноз',
        'мне диагностировали',
        'я сам поставил себе диагноз',
        'on ma diagnostique',
        'jai ete diagnostique',
        'je suis diagnostique',
        'mon diagnostic',
        'me diagnosticaron',
        'estoy diagnosticado',
        'mi diagnostico',
        'me autodiagnostique',
    ],
    true,
);
export function containsPortraitDiagnosticDisclosure(text: string): boolean {
    const normalized = normalizePortraitDisclosure(text);
    return (
        diagnosticLabel.test(normalized) ||
        diagnosticAcronym.test(normalized) ||
        selfDiagnosis.test(normalized)
    );
}
export function validateReusablePortraitItems(input: unknown): PortraitItems {
    const items = PortraitItemsSchema.parse(input);
    const customText = [
        ...items.languages.flatMap((item) =>
            item.clarification ? [item.clarification] : [],
        ),
        ...items.goals,
        ...items.accommodations,
        ...items.hobbies,
        ...(items.mixingNote ? [items.mixingNote] : []),
        ...(items.notes?.map((note) => note.text) ?? []),
    ];
    if (customText.some(containsPortraitDiagnosticDisclosure))
        throw new PortraitSensitiveContentError(
            'Describe what helps you learn or a concrete learning preference. Remove diagnostic labels and diagnosis statements.',
        );
    return items;
}
