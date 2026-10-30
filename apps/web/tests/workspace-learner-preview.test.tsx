import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { KnowledgeWorkingContent } from '@languon/contracts';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';
import { WorkspaceLearnerPreview } from '../src/fsd/pages/knowledge/ui/knowledge-detail-page/workspace-learner-preview/workspace-learner-preview';

it('previews current content with local answers without consuming or writing saved learner activity', () => {
    const persist = vi.fn();
    const close = vi.fn();
    const content: KnowledgeWorkingContent = {
        title: 'Unsaved draft title',
        summary: 'Current draft summary',
        categories: [],
        body: {
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
                                title: 'Practice',
                                format: 'free-text',
                                question: 'What happened?',
                                referenceAnswer: 'She left.',
                                explanation:
                                    'The passage describes her departure.',
                            },
                        },
                    },
                ],
            },
        },
    };
    render(
        <I18nProvider locale='en' messages={en}>
            <WorkspaceLearnerPreview
                content={content}
                onClose={close}
                blockOptions={() => ({
                    onInteraction: persist,
                    onSubmitAttempt: persist,
                    onEvaluate: persist,
                    onAttemptedChange: persist,
                    learnerState: {
                        attempted: true,
                        answerRevealed: true,
                        hintUsed: false,
                    },
                })}
            />
        </I18nProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.getByText('Current draft summary')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /What happened\?/u }));
    expect(screen.queryByText('She left.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('She left.')).toBeVisible();
    expect(
        screen.getByText('The passage describes her departure.'),
    ).toBeVisible();
    expect(persist).not.toHaveBeenCalled();
    expect(
        screen.queryByRole('button', { name: 'Check with AI' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }));
    expect(close).toHaveBeenCalledOnce();
});
