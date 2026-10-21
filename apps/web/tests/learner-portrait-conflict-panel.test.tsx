import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PortraitItems } from '@languon/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ConflictPanel } from '@/fsd/pages/learner-portrait/ui/conflict-panel/conflict-panel';
import { conflictFieldValue } from '@/fsd/pages/learner-portrait/ui/conflict-panel/field-value';
import { portraitCopy } from '@/fsd/pages/learner-portrait/lib/copy';
import { render } from './render';

const base: PortraitItems = {
    languages: [{ language: 'en', learning: false, level: 'native' }],
    explanationLanguages: ['en'],
    goals: [],
    accommodations: ['Keep unchanged needs'],
    hobbies: ['Unchanged hobby'],
};
const cases = [
    {
        locale: 'en',
        goals: 'Goals',
        tone: 'Tone',
        unrelated: 'Interests',
        draftTone: 'Friendly',
    },
    {
        locale: 'ru',
        goals: 'Цели',
        tone: 'Тон',
        unrelated: 'Интересы',
        draftTone: 'Дружелюбный',
    },
    {
        locale: 'fr',
        goals: 'Objectifs',
        tone: 'Ton',
        unrelated: 'Centres d’intérêt',
        draftTone: 'Amical',
    },
    {
        locale: 'es',
        goals: 'Objetivos',
        tone: 'Tono',
        unrelated: 'Intereses',
        draftTone: 'Cercano',
    },
] as const;

describe('compact field-specific portrait reconciliation', () => {
    it.each(cases)(
        'shows only the changed values and preserves explicit choices in $locale',
        async ({ locale, goals, tone, unrelated }) => {
            const latest = {
                ...base,
                goals: ['Work'],
                tone: 'formal' as const,
            };
            const draft = {
                ...base,
                goals: ['Travel'],
                tone: 'friendly' as const,
            };
            const reconcile = vi.fn();
            render(
                <ConflictPanel
                    latest={latest}
                    draft={draft}
                    onReconcile={reconcile}
                />,
                { locale },
            );
            const goalGroup = screen.getByRole('group', { name: goals });
            const toneGroup = screen.getByRole('group', { name: tone });
            const savedGoal = `${portraitCopy(locale, 'latest')}: Work`;
            const proposedTone = `${portraitCopy(locale, 'proposed')}: ${conflictFieldValue(draft, 'tone', locale)}`;
            expect(
                within(goalGroup).getByRole('radio', { name: savedGoal }),
            ).toBeVisible();
            expect(
                within(goalGroup).getByRole('radio', {
                    name: `${portraitCopy(locale, 'proposed')}: Travel`,
                }),
            ).toBeVisible();
            expect(screen.queryByText(unrelated)).not.toBeInTheDocument();
            expect(
                screen.queryByText('Unchanged hobby'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('Keep unchanged needs'),
            ).not.toBeInTheDocument();
            expect(screen.getAllByRole('radio')).toHaveLength(4);
            const apply = screen.getByRole('button', {
                name: portraitCopy(locale, 'reconcile'),
            });
            expect(apply).toBeDisabled();
            await userEvent.click(
                within(goalGroup).getByRole('radio', { name: savedGoal }),
            );
            expect(apply).toBeDisabled();
            await userEvent.click(
                within(toneGroup).getByRole('radio', { name: proposedTone }),
            );
            await userEvent.click(apply);
            expect(reconcile).toHaveBeenCalledWith({
                ...base,
                goals: ['Work'],
                tone: 'friendly',
            });
        },
    );

    it('renders missing values concisely and formats mixed-language and note fields without unrelated sections', () => {
        expect(conflictFieldValue(base, 'tone', 'en')).toBe('—');
        expect(
            conflictFieldValue(
                { ...base, mixedLanguageFrequency: 'sometimes' },
                'mixedLanguageFrequency',
                'en',
            ),
        ).toBe('Sometimes');
        expect(
            conflictFieldValue(
                {
                    ...base,
                    notes: [
                        {
                            id: '10000000-0000-4000-8000-000000000001',
                            topic: 'style',
                            text: 'Confirm this exact note',
                        },
                    ],
                },
                'notes',
                'en',
            ),
        ).toBe('Confirm this exact note');
    });
});
