import type { ChatPreferences } from '@languon/contracts';

export const portraitFields = [
    'replyLanguage',
    'tone',
    'explanationLevel',
    'detail',
    'wording',
    'approach',
] as const;
export type PortraitField = (typeof portraitFields)[number];

/** Keep saved manual fallbacks intact when changing a displayed inherited value. */
export function mergeDisplayedPreferences(
    manual: ChatPreferences,
    displayed: ChatPreferences,
    next: ChatPreferences,
): ChatPreferences {
    const result = { ...manual, mode: next.mode };
    let inherited = [
        ...(next.portrait?.inheritedFields ??
            manual.portrait?.inheritedFields ??
            []),
    ];
    for (const field of portraitFields) {
        if (next[field] !== displayed[field]) {
            Object.assign(result, { [field]: next[field] });
            const replacesLegacyLevel =
                field === 'detail' || field === 'wording';
            inherited = inherited.filter(
                (item) =>
                    item !== field &&
                    !(replacesLegacyLevel && item === 'explanationLevel'),
            );
        }
    }
    if (next.portrait || manual.portrait)
        result.portrait = {
            enabled: next.portrait?.enabled ?? manual.portrait?.enabled ?? true,
            inheritedFields: inherited,
        };
    return result;
}

export function inheritPortraitField(
    value: ChatPreferences,
    field?: PortraitField,
): ChatPreferences {
    const inheritedFields = field
        ? Array.from(
              new Set([...(value.portrait?.inheritedFields ?? []), field]),
          )
        : [...portraitFields];
    return {
        ...value,
        portrait: { enabled: value.portrait?.enabled ?? true, inheritedFields },
    };
}
