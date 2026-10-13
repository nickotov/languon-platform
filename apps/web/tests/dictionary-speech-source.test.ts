import { describe, expect, it } from 'vitest';
import { dictionarySpeechSource } from '@/fsd/widgets/dictionary-editor/lib/dictionary-speech-source';

describe('dictionary speech snapshot guards', () => {
    it('preserves the visible card settings when dictionary metadata refreshed earlier', () => {
        const freshDictionary = {
            id: '00000000-0000-4000-8000-000000000001',
            version: 2,
            settingsVersion: 2,
        };
        const visibleCard = {
            id: '00000000-0000-4000-8000-000000000002',
            version: 1,
            settingsVersion: 1,
        };
        const source = dictionarySpeechSource(
            freshDictionary,
            visibleCard,
            'example',
        );
        expect(source.expectedDictionaryVersion).toBe(2);
        expect(source.expectedSettingsVersion).toBe(1);
        expect(source.expectedVersion).toBe(1);
        expect(source.field).toBe('example');
    });
    it('advances the settings guard after the card snapshot refreshes', () => {
        const dictionary = {
            id: '00000000-0000-4000-8000-000000000001',
            version: 2,
            settingsVersion: 2,
        };
        const card = {
            id: '00000000-0000-4000-8000-000000000002',
            version: 1,
            settingsVersion: 2,
        };
        const source = dictionarySpeechSource(
            dictionary,
            card,
            'exampleTranslation',
        );
        expect(source.expectedSettingsVersion).toBe(2);
        expect(source.expectedDictionaryVersion).toBe(2);
    });
});
