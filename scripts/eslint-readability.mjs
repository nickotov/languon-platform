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

// BL-018 expands enrollment after the mechanical-only normalization pass.
// Until then, enroll new/substantively changed source explicitly with its fixes.
export const readabilityConfig = {
    files: [
        'apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts',
        'apps/web/src/fsd/features/knowledge-notes/ui/proposal-block-content/proposal-block-content.tsx',
        'scripts/eslint-readability{,.test}.mjs',
    ],
    rules: readabilityRules,
};
