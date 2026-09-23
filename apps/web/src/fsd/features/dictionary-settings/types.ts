import type {
    DictionarySettingsValues,
    LanguageCatalogEntry,
    OwnedDictionary,
    UpdateDictionaryRequest,
} from '@languon/contracts';
export type SaveDictionarySettings = Omit<
    UpdateDictionaryRequest,
    'expectedDictionaryVersion' | 'expectedSettingsVersion'
>;
export type SettingsFormProps = {
    dictionary: OwnedDictionary;
    error?: string | null;
    languages: readonly LanguageCatalogEntry[];
    onSave(values: SaveDictionarySettings): Promise<void>;
    onCancel?(): void;
    pending: boolean;
};
export type SetSetting = <K extends keyof DictionarySettingsValues>(
    key: K,
    value: DictionarySettingsValues[K],
) => void;
