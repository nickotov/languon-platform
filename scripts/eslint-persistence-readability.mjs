// Keep this policy after eslint-config-prettier: Prettier preserves statement
// padding, while that compatibility config disables the corresponding rules.
import { statementSpacingRules } from './eslint-readability.mjs';

export const persistenceReadabilityConfig = {
    files: [
        'apps/backend/src/modules/**/infrastructure/persistence/drizzle/**/*.ts',
        'apps/backend/src/modules/speech/infrastructure/drizzle-speech-store.ts',
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

// The speech facade predates the persistence rule. Ratchet this one file as
// operations move under persistence/drizzle and inherit the ordinary limit.
export const speechStoreReadabilityConfig = {
    files: [
        'apps/backend/src/modules/speech/infrastructure/drizzle-speech-store.ts',
    ],
    rules: {
        'max-lines': [
            'error',
            { max: 2012, skipBlankLines: true, skipComments: true },
        ],
    },
};
