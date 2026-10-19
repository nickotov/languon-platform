import type {
    DictionaryCard,
    OwnedDictionary,
    SpeechSource,
} from '@languon/contracts';

/** Query snapshots can refresh separately: guard precisely the settings used by the visible card. */
export function dictionarySpeechSource(
    dictionary: Pick<OwnedDictionary, 'id' | 'version' | 'settingsVersion'>,
    card: Pick<DictionaryCard, 'id' | 'version' | 'settingsVersion'>,
    field: Extract<SpeechSource, { kind: 'dictionary-field' }>['field'],
): Extract<SpeechSource, { kind: 'dictionary-field' }> {
    return {
        kind: 'dictionary-field',
        access: { kind: 'owner', dictionaryId: dictionary.id },
        cardId: card.id,
        field,
        expectedVersion: card.version,
        expectedDictionaryVersion: dictionary.version,
        expectedSettingsVersion: card.settingsVersion,
    };
}
