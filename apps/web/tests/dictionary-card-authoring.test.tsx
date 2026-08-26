import type {
    DictionaryCard,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
    DictionaryCardForm,
    hasLoadedSourceDuplicate,
    normalizeDictionarySource,
    previewCardEffectiveSettings,
} from '@/fsd/features/dictionary-card-authoring';
import { DictionaryCardList } from '@/fsd/features/dictionary-card-list';
import { DictionarySettingsForm } from '@/fsd/features/dictionary-settings';

import { render } from './render';

const languages = [
    {
        direction: 'rtl',
        displayNames: {
            en: 'Arabic',
            es: 'Árabe',
            fr: 'Arabe',
            ru: 'Арабский',
        },
        tag: 'ar',
    },
    {
        direction: 'ltr',
        displayNames: {
            en: 'English',
            es: 'Inglés',
            fr: 'Anglais',
            ru: 'Английский',
        },
        tag: 'en',
    },
    {
        direction: 'ltr',
        displayNames: {
            en: 'Spanish',
            es: 'Español',
            fr: 'Espagnol',
            ru: 'Испанский',
        },
        tag: 'es',
    },
] as LanguageCatalogEntry[];

const dictionary: OwnedDictionary = {
    activeCardCount: 1,
    archivedAt: null,
    createdAt: '2026-08-21T10:00:00.000Z',
    description: null,
    id: '10000000-0000-4000-8000-000000000001',
    languagePairLocked: true,
    lifecycle: 'active',
    name: 'Studio Spanish',
    settings: {
        updatedAt: '2026-08-21T10:00:00.000Z',
        values: {
            definitionEnabled: false,
            definitionLanguage: 'source',
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
            transcriptionCustomLabel: null,
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa',
        },
        version: 1,
    },
    settingsVersion: 1,
    sourceDictionaryId: null,
    sourceLanguage: 'en',
    targetLanguage: 'es',
    updatedAt: '2026-08-21T10:00:00.000Z',
    version: 1,
    visibility: 'private',
};

const card: DictionaryCard = {
    archivedAt: null,
    authorship: 'human',
    createdAt: '2026-08-21T10:00:00.000Z',
    dictionaryId: dictionary.id,
    effectiveSettings: {
        definitionEnabled: false,
        definitionLanguage: 'source',
        exampleEnabled: true,
        exampleLanguage: 'source',
        exampleTranslationEnabled: true,
        exampleTranslationLanguage: 'target',
        transcriptionCustomLabel: null,
        transcriptionEnabled: false,
        transcriptionNotation: 'ipa',
    },
    id: '20000000-0000-4000-8000-000000000001',
    lifecycle: 'active',
    overrides: {
        definitionEnabled: null,
        definitionLanguage: null,
        exampleEnabled: null,
        exampleLanguage: null,
        exampleTranslationEnabled: null,
        transcriptionCustomLabel: null,
        transcriptionEnabled: null,
        transcriptionNotation: null,
    },
    position: '1000',
    settingsVersion: 1,
    updatedAt: '2026-08-21T10:00:00.000Z',
    values: {
        definition: '<img src=x onerror=alert(1)>',
        example: 'The curator draws a distinction.',
        exampleTranslation: 'La comisaria establece una distinción.',
        source: '<script>alert(1)</script>',
        transcription: null,
        translation: 'establecer una distinción',
    },
    version: 1,
};

describe('dictionary settings and card authoring', () => {
    it('previews draft overrides without replacing server authority', () => {
        const effective = previewCardEffectiveSettings(
            dictionary.settings.values,
            {
                ...card.overrides,
                exampleEnabled: 'disabled',
                exampleTranslationEnabled: 'enabled',
                transcriptionEnabled: 'enabled',
            },
        );
        expect(effective.transcriptionEnabled).toBe(true);
        expect(effective.exampleEnabled).toBe(false);
        expect(effective.exampleTranslationEnabled).toBe(false);
    });

    it('preserves a dormant example-translation setting and uses the server lock flag', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionarySettingsForm
                dictionary={{ ...dictionary, activeCardCount: 0 }}
                languages={languages}
                onSave={onSave}
                pending={false}
            />,
        );
        expect(screen.getByLabelText('Translate from')).toBeDisabled();
        await user.click(screen.getByLabelText('Context example'));
        await user.click(screen.getByRole('button', { name: 'Save settings' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: expect.objectContaining({
                    exampleEnabled: false,
                }),
            }),
        );
        expect(onSave.mock.calls[0]?.[0].settings).not.toHaveProperty(
            'exampleTranslationEnabled',
        );
    });

    it('captures editable metadata and language values before deferred state updates', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionarySettingsForm
                dictionary={{
                    ...dictionary,
                    activeCardCount: 0,
                    languagePairLocked: false,
                }}
                languages={languages}
                onSave={onSave}
                pending={false}
            />,
        );

        await user.clear(screen.getByLabelText('Name'));
        await user.type(screen.getByLabelText('Name'), 'Arabic studio');
        await user.type(screen.getByLabelText(/^Description/), 'RTL practice');
        await user.selectOptions(screen.getByLabelText('Translate from'), 'ar');
        await user.click(screen.getByRole('button', { name: 'Save settings' }));

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                description: 'RTL practice',
                name: 'Arabic studio',
                sourceLanguage: 'ar',
                targetLanguage: 'es',
            }),
        );
    });

    it('reveals a newly enabled field before save and blocks an invalid child enable', async () => {
        const user = userEvent.setup();
        render(
            <DictionaryCardForm
                dictionary={{
                    ...dictionary,
                    settings: {
                        ...dictionary.settings,
                        values: {
                            ...dictionary.settings.values,
                            exampleEnabled: false,
                        },
                    },
                }}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        await user.click(screen.getByText('Advanced settings'));
        const transcriptionOverride = screen.getByLabelText('Transcription');
        await user.selectOptions(transcriptionOverride, 'enabled');
        expect(screen.getAllByLabelText('Transcription')).toHaveLength(2);
        const exampleTranslation = screen.getByLabelText('Example translation');
        expect(
            exampleTranslation.querySelector('option[value="enabled"]'),
        ).toBeDisabled();
    });

    it('allows normalized duplicates with a non-blocking different-context warning', async () => {
        expect(normalizeDictionarySource('  Ｍedium  ')).toBe('medium');
        expect(hasLoadedSourceDuplicate('MEDIUM', ['medium'])).toBe(true);
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryCardForm
                dictionary={dictionary}
                existingSources={['medium']}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );
        await user.type(screen.getByLabelText(/Source phrase/), ' Medium ');
        expect(screen.getByRole('status')).toHaveTextContent(
            'Different senses and contexts are allowed',
        );
        await user.type(
            screen.getByLabelText(/Translation/),
            'medio artístico',
        );
        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenCalled();
    });

    it('uses catalog direction for mixed-language authoring and disables cancellation while saving', () => {
        render(
            <DictionaryCardForm
                dictionary={{
                    ...dictionary,
                    sourceLanguage: 'ar',
                    targetLanguage: 'en',
                }}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending
            />,
        );

        expect(screen.getByLabelText(/Source phrase/)).toHaveAttribute(
            'dir',
            'rtl',
        );
        expect(screen.getByLabelText(/Translation/)).toHaveAttribute(
            'dir',
            'ltr',
        );

        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    it('renders malicious card strings as inert text in responsive semantic DOM', () => {
        const { container } = render(
            <DictionaryCardList
                cards={[card]}
                dictionary={dictionary}
                languages={languages}
                lifecycle='active'
                onEdit={vi.fn()}
                onLifecycle={vi.fn()}
                onMove={vi.fn()}
                pending={false}
            />,
        );
        expect(
            screen.getByText('<script>alert(1)</script>'),
        ).toBeInTheDocument();
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('ol')).toBeInTheDocument();
        expect(container.querySelector('table')).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Move earlier' }),
        ).toBeDisabled();
    });

    it('opens retained generation reviews when starting new work is unavailable', async () => {
        const user = userEvent.setup();
        const onGenerate = vi.fn();
        render(
            <DictionaryCardList
                cards={[card]}
                dictionary={dictionary}
                generationAvailable={false}
                languages={languages}
                lifecycle='active'
                onEdit={vi.fn()}
                onGenerate={onGenerate}
                onLifecycle={vi.fn()}
                onMove={vi.fn()}
                pending={false}
            />,
        );

        await user.click(
            screen.getByRole('button', {
                name: 'Card actions, card 1',
            }),
        );
        const openReview = screen.getByRole('menuitem', {
            name: 'Open AI review',
        });
        expect(openReview).toBeEnabled();
        await user.click(openReview);
        expect(onGenerate).toHaveBeenCalledWith(card);
    });
});
