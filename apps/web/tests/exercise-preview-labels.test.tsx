import { fireEvent, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import {
    LearningBlockView,
    exerciseActivityExamples,
    exerciseExampleLabels,
} from '../src/fsd/entities/learning-blocks';
import { render } from './render';

const exercise = exerciseActivityExamples('en').find(
    (item) => item.activity.id === 'G03',
)!.block;

it.each([
    ['en', 'Reference answer'],
    ['ru', 'Эталонный ответ'],
    ['fr', 'Réponse de référence'],
    ['es', 'Respuesta de referencia'],
] as const)(
    'labels prepared review answers without implying an attempt in %s',
    (locale, label) => {
        render(
            <LearningBlockView
                block={exercise}
                labels={exerciseExampleLabels(locale)}
                variant='review'
                interactionsDisabled
            />,
            { locale },
        );

        expect(screen.getAllByText(`${label}:`)[0]).toBeVisible();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    },
);

it('keeps the learner answer input label for an actual attempt', () => {
    render(
        <LearningBlockView
            block={exercise}
            labels={exerciseExampleLabels('en')}
            variant='learner'
        />,
    );

    fireEvent.click(
        screen.getByRole('button', { name: /Rewrite for an action/ }),
    );

    expect(screen.getByRole('textbox', { name: 'Your answer' })).toBeVisible();
    expect(screen.queryByText('Reference answer:')).not.toBeInTheDocument();
});
