import type { DictionaryCardValues } from '@languon/contracts';

export function cardFieldLimit(field: keyof DictionaryCardValues) {
    return field === 'source' || field === 'translation' ? 200 : 2000;
}

export function limitCardFieldValue(
    field: keyof DictionaryCardValues,
    value: string,
) {
    return Array.from(value).slice(0, cardFieldLimit(field)).join('');
}
