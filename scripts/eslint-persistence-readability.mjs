// Keep this policy after eslint-config-prettier: Prettier preserves statement
// padding, while that compatibility config disables the corresponding rules.
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
        'lines-between-class-members': [
            'error',
            'always',
            { exceptAfterSingleLine: true },
        ],
        'padding-line-between-statements': [
            'error',
            { blankLine: 'always', prev: '*', next: ['return', 'throw'] },
            {
                blankLine: 'always',
                prev: ['block-like', 'multiline-expression'],
                next: '*',
            },
            {
                blankLine: 'always',
                prev: ['multiline-const', 'multiline-let'],
                next: '*',
            },
            {
                blankLine: 'any',
                prev: ['const', 'let'],
                next: ['const', 'let'],
            },
        ],
    },
};
