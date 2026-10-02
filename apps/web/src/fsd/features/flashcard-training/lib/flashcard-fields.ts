import type { Configuration, Field } from '../types';

export const DEFAULT_CONFIGURATION: Configuration = {
    front: ['targetExample'],
    back: ['sourceExample'],
};
export const FIELD_ORDER: Field[] = [
    'source',
    'translation',
    'transcription',
    'definition',
    'sourceExample',
    'targetExample',
];
export function orderFields(fields: Field[]): Field[] {
    return FIELD_ORDER.filter((field) => fields.includes(field));
}
export function sameFieldSet(front: Field[], back: Field[]): boolean {
    return (
        front.length === back.length &&
        front.every((field) => back.includes(field))
    );
}
export function shuffled(ids: string[], random = Math.random): string[] {
    const copy = [...ids];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        [copy[index], copy[other]] = [copy[other]!, copy[index]!];
    }
    return copy;
}
