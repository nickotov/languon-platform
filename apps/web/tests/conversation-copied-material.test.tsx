import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CopiedAttachmentSchema } from '@languon/contracts';
import { CopiedMaterial } from '../src/fsd/entities/conversation/ui/copied-material/copied-material';
import { render } from './render';

afterEach(cleanup);
const card = {
    source: 'مرحبا',
    translation: 'Hello',
    sourceLanguage: 'ar',
    targetLanguage: 'en',
    definition: 'تحية',
    definitionLanguage: 'ar',
    transcription: 'marḥaban',
    transcriptionNotation: 'romanization',
    example: 'مرحبا يا صديقي',
    exampleLanguage: 'ar',
    exampleTranslation: 'Hello, my friend',
    exampleTranslationLanguage: 'en',
};
function copy(id: string) {
    return CopiedAttachmentSchema.parse({
        id,
        label: card.source,
        kind: 'dictionary-card',
        card,
        content: JSON.stringify(card),
    });
}

it('renders multiple immutable card copies as labeled fields with their languages and automatic text direction', () => {
    const first = copy('00000000-0000-4000-8000-000000000001');
    const second = copy('00000000-0000-4000-8000-000000000002');
    const { container } = render(
        <>
            <CopiedMaterial attachment={first} />
            <CopiedMaterial attachment={second} />
        </>,
    );
    for (const label of [
        'Source',
        'Translation',
        'Definition',
        'Transcription (romanization)',
        'Example',
        'Example translation',
    ])
        expect(screen.getAllByText(label)).toHaveLength(2);
    for (const value of screen.getAllByText('تحية'))
        expect(value).toHaveAttribute('lang', 'ar');
    for (const value of screen.getAllByText('Hello, my friend')) {
        expect(value).toHaveAttribute('lang', 'en');
        expect(value).toHaveAttribute('dir', 'auto');
    }
    expect(container.textContent).not.toContain('"source":');
    expect(container.querySelectorAll('dl')).toHaveLength(2);
});

it('keeps pasted/legacy JSON and HTML-looking material inert without inventing typed fields', () => {
    const content = `${JSON.stringify(card)}<img src=x onerror=alert(1)>`;
    const { container } = render(
        <CopiedMaterial
            attachment={{
                id: '00000000-0000-4000-8000-000000000001',
                label: 'Pasted material',
                content,
            }}
        />,
    );
    expect(screen.getByText(content)).toBeInTheDocument();
    expect(screen.queryByText('Definition')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('dl')).toBeNull();
});
