import {
    ChatPreferencesSchema,
    PortraitDocumentSchema,
    type ChatPreferences,
} from '@languon/contracts';

/** Composition supplies owner-authorized approved state only, never a draft. */
export interface ConversationPortraitPolicy {
    enabled: boolean;
    portrait: unknown | null;
}
export type PortraitPreferenceField =
    | 'replyLanguage'
    | 'tone'
    | 'explanationLevel'
    | 'detail'
    | 'wording'
    | 'approach';
export const portraitPreferenceFields: PortraitPreferenceField[] = [
    'replyLanguage',
    'tone',
    'explanationLevel',
    'detail',
    'wording',
    'approach',
];
export function resolveConversationPortrait(
    manual: ChatPreferences,
    policy: ConversationPortraitPolicy,
) {
    const preferences = ChatPreferencesSchema.parse(manual);
    const origins: Record<PortraitPreferenceField, 'manual' | 'portrait'> = {
        replyLanguage: 'manual',
        tone: 'manual',
        explanationLevel: 'manual',
        detail: 'manual',
        wording: 'manual',
        approach: 'manual',
    };
    // Invalid stored/external input fails closed; it must never become prompt instructions.
    const parsed = PortraitDocumentSchema.safeParse(policy.portrait);
    if (
        !policy.enabled ||
        preferences.portrait?.enabled === false ||
        !parsed.success
    )
        return { preferences, origins };
    const items = parsed.data.items;
    const inherited = new Set(preferences.portrait?.inheritedFields ?? []);
    if (inherited.has('replyLanguage') && items.explanationLanguages[0]) {
        preferences.replyLanguage = items.explanationLanguages[0];
        origins.replyLanguage = 'portrait';
    }
    if (inherited.has('tone') && items.tone) {
        preferences.tone =
            items.tone === 'friendly'
                ? 'conversational'
                : items.tone === 'formal'
                  ? 'academic'
                  : 'neutral';
        origins.tone = 'portrait';
    }
    if (inherited.has('explanationLevel') && (items.wording || items.detail)) {
        preferences.explanationLevel =
            items.wording === 'simple'
                ? 'beginner'
                : items.detail === 'detailed'
                  ? 'detailed'
                  : 'auto';
        origins.explanationLevel = 'portrait';
    }
    for (const field of ['detail', 'wording', 'approach'] as const) {
        if (inherited.has(field) && items[field]) {
            Object.assign(preferences, { [field]: items[field] });
            origins[field] = 'portrait';
        }
    }
    // Summary is derived presentation, not additional model authority. Only structured confirmed data is supplied.
    return { preferences, origins, context: items };
}
