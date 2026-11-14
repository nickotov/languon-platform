import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    LearningBlockSchema,
    type ExerciseLearningBlock,
} from '@languon/contracts';
import { LearningBlockView } from '@/fsd/entities/learning-blocks';
import { defaultBlockLabels } from '@/fsd/features/knowledge-notes/ui/learning-block-authoring/block-labels';

const id = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const segmentId = '33333333-3333-4333-8333-333333333333';
const yes = '44444444-4444-4444-8444-444444444444';
const no = '55555555-5555-4555-8555-555555555555';
const absent = '66666666-6666-4666-8666-666666666666';
const question = 'ミラのかばんは赤いです。';

function classification(): ExerciseLearningBlock {
    return LearningBlockSchema.parse({
        id,
        type: 'exercise',
        format: 'multiple-choice',
        question,
        choices: [
            { id: yes, text: 'True' },
            { id: no, text: 'False' },
            { id: absent, text: 'Not stated' },
        ],
        correctChoiceId: absent,
        referenceAnswer: 'Not stated',
        explanation: 'В тексте не указан цвет сумки.',
        semantics: {
            activity: { id: 'R03', version: 1 },
            objective: 'Отличать противоречие от отсутствия информации.',
            language: 'ja',
            explanationLanguage: 'ru',
            format: 'multiple-choice',
            checking: {
                policy: 'prepared-key',
                key: {
                    kind: 'choice',
                    correctChoiceId: absent,
                    explanations: [
                        {
                            choiceId: yes,
                            explanation:
                                'Информация должна совпадать с текстом.',
                        },
                        {
                            choiceId: no,
                            explanation:
                                'Информация должна противоречить тексту.',
                        },
                        {
                            choiceId: absent,
                            explanation: 'Цвет сумки не указан.',
                        },
                    ],
                    classification: {
                        roles: [
                            { choiceId: yes, role: 'true' },
                            { choiceId: no, role: 'false' },
                            { choiceId: absent, role: 'not-stated' },
                        ],
                        absenceRationale: 'Цвет сумки не указан.',
                    },
                },
            },
            sources: [
                {
                    kind: 'text',
                    origin: { kind: 'block', blockId: sourceId },
                    passages: [
                        {
                            segmentId,
                            text: 'ミラは朝、電車で大阪に行きました。',
                        },
                    ],
                },
            ],
        },
    }) as ExerciseLearningBlock;
}

describe('fixed reading classification controls', () => {
    it.each([
        { locale: 'en', expected: ['True', 'False', 'Not stated'] },
        { locale: 'ru', expected: ['Верно', 'Неверно', 'Не сказано'] },
        { locale: 'fr', expected: ['Vrai', 'Faux', 'Non indiqué'] },
        { locale: 'es', expected: ['Verdadero', 'Falso', 'No se indica'] },
    ])(
        'localizes roles for $locale without translating the studied Japanese statement',
        ({ locale, expected }) => {
            render(
                <LearningBlockView
                    block={classification()}
                    labels={{ ...defaultBlockLabels, locale }}
                />,
            );

            expect(screen.getByText(question)).toBeVisible();
            expect(
                screen
                    .getAllByRole('radio')
                    .map((radio) => radio.closest('label')?.textContent),
            ).toEqual(expected);
        },
    );

    it('localizes the revealed answer and proposal preview using the same role identity', () => {
        const labels = {
            ...defaultBlockLabels,
            locale: 'ru',
            showAnswer: 'Показать ответ',
        };
        const { unmount } = render(
            <LearningBlockView block={classification()} labels={labels} />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Показать ответ' }));
        expect(screen.getAllByText('Не сказано')).toHaveLength(2);
        expect(screen.queryByText('Not stated')).not.toBeInTheDocument();
        unmount();

        render(
            <LearningBlockView
                block={classification()}
                labels={labels}
                variant='review'
            />,
        );

        expect(screen.getAllByText('Не сказано')).toHaveLength(2);
        expect(screen.getByText(question)).toBeVisible();
        expect(screen.queryByText('Not stated')).not.toBeInTheDocument();
    });

    it('keeps ordinary authored choice text unchanged after explicit Custom conversion', () => {
        const { semantics: _semantics, ...custom } = classification();
        render(
            <LearningBlockView
                block={custom}
                labels={{ ...defaultBlockLabels, locale: 'ru' }}
            />,
        );

        expect(
            screen
                .getAllByRole('radio')
                .map((radio) => radio.closest('label')?.textContent),
        ).toEqual(['True', 'False', 'Not stated']);
    });
});
