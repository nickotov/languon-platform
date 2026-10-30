import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { LearningBlockView } from '../src/fsd/entities/learning-blocks';
import { LearningNarrative } from '../src/fsd/entities/learning-blocks/ui/learning-narrative/learning-narrative';
import { localizedBlockLabels } from '../src/fsd/features/knowledge-notes/ui/learning-block-authoring/block-locales';

const id = '11111111-1111-4111-8111-111111111111';
const labels = localizedBlockLabels('en').view;

it('preserves every Markdown heading depth with block-sized heading semantics', () => {
    render(
        <LearningNarrative
            content={Array.from(
                { length: 6 },
                (_, index) => `${'#'.repeat(index + 1)} Section ${index + 1}`,
            ).join('\n\n')}
        />,
    );
    for (let level = 1; level <= 6; level++) {
        expect(
            screen.getByRole('heading', {
                name: `Section ${level}`,
                level: level <= 3 ? 3 : 4,
            }),
        ).toBeInTheDocument();
    }
});

it.each(['compact', 'review', 'author', 'learner'] as const)(
    'renders readable grammar prose in %s without formatting source examples',
    (variant) => {
        const { container } = render(
            <LearningBlockView
                labels={labels}
                variant={variant}
                block={{
                    id,
                    type: 'grammar',
                    language: 'fr',
                    title: 'Subjonctif',
                    rule: '**Use cases**\n\n- Wishes\n- Necessity\n\nKeep the intended meaning.',
                    pattern:
                        '1. Start with `ils parlent`.\n2. Remove `-ent`.\n\n| Person | Form |\n| --- | --- |\n| je | parle |',
                    examples: [
                        {
                            text: 'Literal **source**',
                            translation: 'Literal _translation_',
                        },
                    ],
                    commonMistakes: [
                        {
                            incorrect: 'Incorrect **source**',
                            correct: 'Correct _source_',
                            explanation: 'Use **subjonctif** here.',
                        },
                    ],
                }}
            />,
        );
        expect(container.querySelector('strong')?.textContent).toBe(
            'Use cases',
        );
        expect(container.querySelector('ul')?.textContent).toContain('Wishes');
        expect(container.querySelector('ol')).not.toBeNull();
        expect(container.querySelector('code')?.textContent).toBe(
            'ils parlent',
        );
        expect(container.querySelector('table')).not.toBeNull();
        expect(screen.getByText('Literal **source**')).toBeInTheDocument();
        expect(screen.getByText('Literal _translation_')).toBeInTheDocument();
        if (variant !== 'compact')
            expect(
                screen.getByText('subjonctif', { selector: 'strong' }),
            ).toBeInTheDocument();
    },
);

it('treats HTML as literal text and rejects executable URLs and media', () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    const { container } = render(
        <LearningNarrative
            content={`${hostile}\n\n[unsafe](javascript:alert%281%29) [data](data:text/html,bad) [safe](https://example.test/lesson) ![tracking](https://example.test/pixel)`}
        />,
    );
    expect(container.textContent).toContain(hostile);
    expect(
        container.querySelector(
            'script,img,iframe,svg,object,embed,style,video,audio',
        ),
    ).toBeNull();
    expect(container.querySelector('[onerror], [onclick]')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'safe' })).toHaveAttribute(
        'rel',
        'noopener noreferrer',
    );
    expect(screen.queryByRole('link', { name: 'unsafe' })).toBeNull();
});

it('formats a prepared exercise explanation after reveal without altering its answer', () => {
    const { container } = render(
        <LearningBlockView
            labels={labels}
            block={{
                id,
                type: 'exercise',
                format: 'free-text',
                question: 'Complete the phrase.',
                referenceAnswer: 'Literal **answer**',
                explanation:
                    '**Reason**\n\n- Subject agreement\n- Present tense',
            }}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: labels.showAnswer }));
    expect(screen.getByText('Literal **answer**')).toBeInTheDocument();
    expect(container.querySelector('strong')?.textContent).toBe('Reason');
    expect(
        screen.getByText('Subject agreement', { selector: 'li' }),
    ).toBeInTheDocument();
});
