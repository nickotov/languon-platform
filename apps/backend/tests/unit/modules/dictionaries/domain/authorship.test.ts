import { describe, expect, it } from 'vitest';

import {
    areCardSemanticStatesEqual,
    authorshipForNewCard,
    type CardAuthorship,
    resolveCardMutationAuthorship,
} from '../../../../../src/modules/dictionaries/domain/authorship';
import { inheritedCardSettingsOverrides } from '../../../../../src/modules/dictionaries/domain/settings';

describe('dictionary card authorship', () => {
    it('assigns new card authorship from trusted creation provenance', () => {
        expect(authorshipForNewCard('manual')).toBe('human');
        expect(authorshipForNewCard('deterministic_import')).toBe('human');
        expect(authorshipForNewCard('ai_candidate')).toBe('ai-generated');
        expect(authorshipForNewCard('ai_candidate', true)).toBe('mixed');
    });

    it.each<[CardAuthorship, CardAuthorship]>([
        ['human', 'human'],
        ['ai-generated', 'mixed'],
        ['mixed', 'mixed'],
    ])('applies manual edits from %s to %s', (prior, authorship) => {
        expect(
            resolveCardMutationAuthorship({
                mutationKind: 'manual_edit',
                prior,
                semanticChange: true,
            }),
        ).toEqual({ authorship, createsRevision: true, noOp: false });
    });

    it.each<[CardAuthorship, CardAuthorship]>([
        ['human', 'mixed'],
        ['ai-generated', 'ai-generated'],
        ['mixed', 'mixed'],
    ])('applies untouched AI acceptance from %s to %s', (prior, authorship) => {
        expect(
            resolveCardMutationAuthorship({
                mutationKind: 'ai_proposal_accept',
                prior,
                proposalEdited: false,
                semanticChange: true,
            }),
        ).toEqual({ authorship, createsRevision: true, noOp: false });
    });

    it('makes edited AI acceptance mixed and identical acceptance a true no-op', () => {
        const stored = {
            overrides: { ...inheritedCardSettingsOverrides },
            values: {
                definition: null,
                example: 'It is a house.',
                exampleTranslation: null,
                source: 'Haus',
                transcription: null,
                translation: 'house',
            },
        };
        const candidate = {
            overrides: { ...inheritedCardSettingsOverrides },
            values: {
                ...stored.values,
                source: ' Haus ',
            },
        };

        expect(areCardSemanticStatesEqual(stored, candidate)).toBe(true);
        expect(
            resolveCardMutationAuthorship({
                mutationKind: 'ai_proposal_accept',
                prior: 'ai-generated',
                proposalEdited: true,
                semanticChange: true,
            }).authorship,
        ).toBe('mixed');
        expect(
            resolveCardMutationAuthorship({
                mutationKind: 'ai_proposal_accept',
                prior: 'human',
                proposalEdited: false,
                semanticChange: !areCardSemanticStatesEqual(stored, candidate),
            }),
        ).toEqual({
            authorship: 'human',
            createsRevision: false,
            noOp: true,
        });
    });

    it.each([
        'reorder',
        'archive',
        'restore',
        'inherited_settings_change',
        'fork',
    ] as const)('preserves authorship for %s', (mutationKind) => {
        expect(
            resolveCardMutationAuthorship({
                mutationKind,
                prior: 'ai-generated',
                semanticChange: true,
            }),
        ).toEqual({
            authorship: 'ai-generated',
            createsRevision: false,
            noOp: false,
        });
    });
});
