// Keep this policy after eslint-config-prettier: Prettier preserves statement
// padding, while that compatibility config disables the corresponding rules.
import { statementSpacingRules } from './eslint-readability.mjs';

export const persistenceReadabilityConfig = {
    files: [
        'apps/backend/src/modules/**/infrastructure/persistence/drizzle/**/*.ts',
    ],
    ignores: ['**/schema.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
        'max-lines': [
            'error',
            { max: 500, skipBlankLines: true, skipComments: true },
        ],
        ...statementSpacingRules,
    },
};

// BL-018 added required braces without changing these near-limit implementations.
// Exact temporary ceilings prevent unrelated growth; BL-019 owns their removal.
// Rationale/review: .agent/improvements/codebase-mechanical-formatting.md.
export const persistenceFormattingAllowances = [
    {
        files: [
            'apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-turn-admission.ts',
        ],
        rules: {
            'max-lines': [
                'error',
                { max: 505, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: [
            'apps/backend/src/modules/texts/infrastructure/persistence/drizzle/text-content-mutations.ts',
        ],
        rules: {
            'max-lines': [
                'error',
                { max: 502, skipBlankLines: true, skipComments: true },
            ],
        },
    },
    {
        files: [
            'apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-admission.ts',
        ],
        rules: {
            'max-lines': [
                'error',
                { max: 504, skipBlankLines: true, skipComments: true },
            ],
        },
    },
];
