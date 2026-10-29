import { LearningMediaUrlSchema } from '@languon/contracts';

/** A resolved URL is supplied by an authorized feature, never derived from an asset ID. */
export function safeAudioUrl(value: string | undefined): string | undefined {
    if (!value || value.length > 2_048) return undefined;
    if (
        Array.from(value).some(
            (character) =>
                character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
    )
        return undefined;
    if (
        value.startsWith('blob:') &&
        typeof location !== 'undefined' &&
        !/[\s\\]/u.test(value)
    ) {
        try {
            const blob = new URL(value);
            if (blob.origin === location.origin && location.origin !== 'null')
                return value;
        } catch {
            return undefined;
        }
    }
    if (/^\/(?!\/)/u.test(value) && !/[\s\\]/u.test(value)) return value;
    const parsed = LearningMediaUrlSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
}
