// Keep after eslint-config-prettier: Prettier preserves meaningful blank lines.
export const statementSpacingRules = {
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
};

export const readabilityRules = {
    curly: ['error', 'all'],
    ...statementSpacingRules,
};

// Match maintained implementations and tests; generated and imported artifacts
// retain their own immutable source identity instead of acquiring lint fixes.
export const readabilityConfig = {
    files: [
        '*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}',
        '{apps,packages,scripts,infra,web-dev-panel,.github}/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}',
    ],
    ignores: [
        '**/generated/**',
        '**/__generated__/**',
        '**/next-env.d.ts',
        'apps/backend/drizzle/**',
        'apps/*/ios/**',
        'apps/*/android/**',
        'apps/backend/src/modules/ai-credits/infrastructure/pricing/fixtures/**',
    ],
    rules: readabilityRules,
};
