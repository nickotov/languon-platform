import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import { KnowledgeDocumentView } from '../src/fsd/features/knowledge-notes';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';
const body = KnowledgeBodySchema.parse({
    schemaVersion: 2,
    document: {
        type: 'doc',
        content: [
            {
                type: 'learningBlock',
                attrs: {
                    block: {
                        id: '11111111-1111-4111-8111-111111111111',
                        type: 'exercise',
                        format: 'free-text',
                        question: 'When?',
                        referenceAnswer: 'Noon',
                        explanation: 'The passage says noon.',
                    },
                },
            },
        ],
    },
});
it('preserves a learner answer when parent query options and callbacks rerender', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
        <I18nProvider locale='en' messages={en}>
            <KnowledgeDocumentView
                body={body}
                blockOptions={() => ({ onEvaluate: first })}
            />
        </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /When\?/ }));
    fireEvent.change(screen.getByLabelText('Your answer'), {
        target: { value: 'My unsent answer' },
    });
    rerender(
        <I18nProvider locale='en' messages={en}>
            <KnowledgeDocumentView
                body={structuredClone(body)}
                blockOptions={() => ({ onEvaluate: second })}
            />
        </I18nProvider>,
    );
    expect(screen.getByLabelText('Your answer')).toHaveValue(
        'My unsent answer',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check with AI' }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        'My unsent answer',
    );
});
