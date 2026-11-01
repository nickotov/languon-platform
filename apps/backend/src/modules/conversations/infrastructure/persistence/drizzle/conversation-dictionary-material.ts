import type {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';

/** Freeze only effective learner-visible fields; dormant overrides remain private. */
export function projectConversationDictionaryCards(
    dictionary: typeof dictionariesTable.$inferSelect,
    settings: typeof dictionarySettingsTable.$inferSelect | undefined,
    cards: (typeof dictionaryCardsTable.$inferSelect)[],
) {
    const visible = (override: string | null, defaultValue: boolean) =>
        override ? override === 'enabled' : defaultValue;

    return cards.map((card) => {
        const copiedCard = {
            source: card.source,
            translation: card.translation,
            sourceLanguage: dictionary.sourceLanguageTag,
            targetLanguage: dictionary.targetLanguageTag,
            ...(visible(
                card.definitionEnabledOverride,
                settings?.definitionEnabled ?? false,
            )
                ? {
                      definition: card.definition,
                      definitionLanguage:
                          (card.definitionLanguageRoleOverride ??
                              settings?.definitionLanguageRole ??
                              'source') === 'source'
                              ? dictionary.sourceLanguageTag
                              : dictionary.targetLanguageTag,
                  }
                : {}),
            ...(visible(
                card.transcriptionEnabledOverride,
                settings?.transcriptionEnabled ?? false,
            )
                ? {
                      transcription: card.transcription,
                      transcriptionNotation:
                          card.transcriptionNotationOverride ??
                          settings?.transcriptionNotation ??
                          'ipa',
                      ...((card.transcriptionNotationOverride ??
                          settings?.transcriptionNotation ??
                          'ipa') === 'custom'
                          ? {
                                transcriptionCustomLabel:
                                    card.customNotationLabelOverride ??
                                    settings?.customNotationLabel ??
                                    null,
                            }
                          : {}),
                  }
                : {}),
            ...(visible(
                card.exampleEnabledOverride,
                settings?.exampleEnabled ?? true,
            )
                ? {
                      example: card.example,
                      exampleLanguage:
                          (card.exampleLanguageRoleOverride ??
                              settings?.exampleLanguageRole ??
                              'source') === 'source'
                              ? dictionary.sourceLanguageTag
                              : dictionary.targetLanguageTag,
                  }
                : {}),
            ...(visible(
                card.exampleEnabledOverride,
                settings?.exampleEnabled ?? true,
            ) &&
            visible(
                card.exampleTranslationEnabledOverride,
                settings?.exampleTranslationEnabled ?? true,
            )
                ? {
                      exampleTranslation: card.exampleTranslation,
                      exampleTranslationLanguage:
                          (card.exampleLanguageRoleOverride ??
                              settings?.exampleLanguageRole ??
                              'source') === 'source'
                              ? dictionary.targetLanguageTag
                              : dictionary.sourceLanguageTag,
                  }
                : {}),
        };

        return {
            id: card.id,
            label: card.source,
            kind: 'dictionary-card' as const,
            card: copiedCard,
            content: JSON.stringify(copiedCard),
        };
    });
}
