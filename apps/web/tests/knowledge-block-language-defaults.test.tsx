import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LearningBlockSchema } from '@languon/contracts';
import { BlockFormDialog } from '../src/fsd/features/knowledge-notes/ui/learning-block-authoring/block-form-dialog';
import { defaultAuthoringLabels } from '../src/fsd/features/knowledge-notes/ui/learning-block-authoring/block-labels';
import { render } from './render';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';

afterEach(cleanup);

const id = '11111111-1111-4111-8111-111111111111';
const defaults = { content: 'fr', translation: 'ru' };
const common = {
    labels: defaultAuthoringLabels,
    sources: [],
    onClose: vi.fn(),
};

it('preserves the selected speech language without a transcript through local preparation and Apply', async () => {
    const apply = vi.fn().mockReturnValue(true);
    const preparation = vi.fn().mockReturnValue(null);
    render(
        <BlockFormDialog
            {...common}
            kind='audio'
            onApply={apply}
            renderAudioPreparation={preparation}
        />,
    );
    fireEvent.change(screen.getByLabelText('Content language'), {
        target: { value: 'fr' },
    });
    fireEvent.change(screen.getByLabelText('Speech source text'), {
        target: { value: 'Bonjour tout le monde.' },
    });
    await waitFor(() =>
        expect(preparation).toHaveBeenLastCalledWith(
            expect.objectContaining({
                type: 'audio',
                language: 'fr',
                sourceText: 'Bonjour tout le monde.',
            }),
            expect.any(Function),
        ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(apply).toHaveBeenCalledWith(
        expect.objectContaining({
            language: 'fr',
            sourceText: 'Bonjour tout le monde.',
        }),
    );
    expect(apply.mock.calls[0]![0]).not.toHaveProperty('transcript');
});

it('inherits missing legacy audio language once without resetting a title edit when defaults change', () => {
    const block = LearningBlockSchema.parse({
        id,
        type: 'audio',
        title: 'Recording',
        sourceText: 'Bonjour.',
    });
    const apply = vi.fn().mockReturnValue(true);
    const { rerender } = render(
        <BlockFormDialog
            {...common}
            kind='audio'
            block={block}
            languageDefaults={defaults}
            onApply={apply}
        />,
    );
    expect(screen.getByLabelText('Content language')).toHaveValue('fr');
    fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'New title' },
    });
    rerender(
        <I18nProvider locale='en' messages={en}>
            <BlockFormDialog
                {...common}
                kind='audio'
                block={block}
                languageDefaults={{ content: 'de', translation: 'en' }}
                onApply={apply}
            />
        </I18nProvider>,
    );
    expect(screen.getByLabelText('Content language')).toHaveValue('fr');
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(apply).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New title', language: 'fr' }),
    );
});

it.each([
    { language: 'de', expected: 'de' },
    { language: undefined, expected: 'es' },
])(
    'preserves explicit audio/transcript language before note defaults: $expected',
    ({ language, expected }) => {
        const block = LearningBlockSchema.parse({
            id,
            type: 'audio',
            ...(language ? { language } : {}),
            transcript: {
                language: 'es',
                segments: [{ id, text: 'Buenos días.' }],
            },
        });
        const apply = vi.fn().mockReturnValue(true);
        render(
            <BlockFormDialog
                {...common}
                kind='audio'
                block={block}
                languageDefaults={defaults}
                onApply={apply}
            />,
        );
        expect(screen.getByLabelText('Content language')).toHaveValue(expected);
        fireEvent.change(screen.getByLabelText('Title'), {
            target: { value: 'Edited recording' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
        expect(apply).toHaveBeenCalledWith(
            expect.objectContaining({
                language: expected,
                transcript: expect.objectContaining({ language: 'es' }),
            }),
        );
    },
);

it('initializes a new vocabulary block from note languages', () => {
    const apply = vi.fn().mockReturnValue(true);
    render(
        <BlockFormDialog
            {...common}
            kind='vocabulary'
            languageDefaults={defaults}
            onApply={apply}
        />,
    );
    expect(screen.getByLabelText('Content language')).toHaveValue('fr');
    expect(screen.getByLabelText('Translation language')).toHaveValue('ru');
    fireEvent.change(screen.getByLabelText('Word or phrase'), {
        target: { value: 'joie' },
    });
    fireEvent.change(screen.getByLabelText('Translation'), {
        target: { value: 'радость' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(apply).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'fr', translationLanguage: 'ru' }),
    );
});

it('does not require discard confirmation when legacy audio only inherits defaults', () => {
    const close = vi.fn();
    render(
        <BlockFormDialog
            {...common}
            kind='audio'
            block={LearningBlockSchema.parse({
                id,
                type: 'audio',
                sourceText: 'Bonjour.',
            })}
            languageDefaults={defaults}
            onApply={vi.fn()}
            onClose={close}
        />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]!);
    expect(close).toHaveBeenCalledOnce();
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
});

it('updates transcript language when the author explicitly changes the content language', async () => {
    const apply = vi.fn().mockReturnValue(true);
    render(
        <BlockFormDialog
            {...common}
            kind='audio'
            block={LearningBlockSchema.parse({
                id,
                type: 'audio',
                language: 'de',
                transcript: {
                    language: 'es',
                    segments: [{ id, text: 'Bonjour.' }],
                },
            })}
            languageDefaults={defaults}
            onApply={apply}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Languages: German' }));
    await waitFor(() =>
        expect(screen.getByLabelText('Content language')).toBeVisible(),
    );
    fireEvent.change(screen.getByLabelText('Content language'), {
        target: { value: 'fr' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(apply).toHaveBeenCalledWith(
        expect.objectContaining({
            language: 'fr',
            transcript: expect.objectContaining({ language: 'fr' }),
        }),
    );
});
