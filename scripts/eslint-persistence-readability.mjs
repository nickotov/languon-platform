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
