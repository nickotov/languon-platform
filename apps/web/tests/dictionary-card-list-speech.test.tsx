import type { DictionaryCard, OwnedDictionary } from '@languon/contracts';
import { expect, it, vi } from 'vitest';
import { DictionaryCardList } from '@/fsd/features/dictionary-card-list';
import { screen } from '@testing-library/react';
import { render } from './render';

it('preserves exact saved field text when pronunciation controls are present', () => {
    const card = {
        id: '00000000-0000-4000-8000-000000000001',
        version: 1,
        settingsVersion: 1,
        authorship: 'human',
        values: {
            source: 'casa',
            translation: 'house',
            example: 'La casa.',
            exampleTranslation: 'The house.',
        },
        effectiveSettings: {
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
            exampleTranslationLanguage: 'target',
        },
    } as DictionaryCard;
    render(
        <DictionaryCardList
            cards={[card]}
            dictionary={
                {
                    sourceLanguage: 'es',
                    targetLanguage: 'en',
                } as OwnedDictionary
            }
            languages={[]}
            lifecycle='active'
            pending={false}
            onEdit={vi.fn()}
            onLifecycle={vi.fn()}
            onMove={vi.fn()}
            renderAudio={(_, field) => (
                <button type='button' aria-label={`Play ${field}`} />
            )}
        />,
    );
    expect(
        screen.queryByRole('button', { name: 'Play example' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Play exampleTranslation' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Play translation' }),
    ).toBeInTheDocument();
    for (const value of Object.values(card.values)) {
        expect(screen.getByText(value!, { exact: true })).toBeInTheDocument();
    }
    expect(
        screen.getByRole('button', { name: 'Play source' }),
    ).toBeInTheDocument();
    expect(
        screen.getByText('casa', { exact: true }).closest('[lang]'),
    ).toHaveAttribute('lang', 'es');
});
