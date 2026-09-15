import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            '**/.next/**',
            '**/.next-e2e/**',
            '**/.next-*/**',
            '**/.mastra/**',
            '**/.turbo/**',
            '**/coverage/**',
            '**/dist/**',
            '**/node_modules/**',
            '**/storybook-static/**',
            'apps/mobile/.expo/**',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    },
    {
        files: [
            'apps/web/src/**/*.{ts,tsx}',
            'apps/web/{instrumentation,instrumentation-client,proxy}.ts',
        ],
        plugins: {
            boundaries,
        },
        settings: {
            'boundaries/root-path': import.meta.dirname,
            'boundaries/elements': [
                {
                    type: 'app',
                    pattern: 'apps/web/src/app',
                    partialMatch: false,
                },
                {
                    type: 'page',
                    pattern: 'apps/web/src/fsd/pages/*',
                    partialMatch: false,
                    capture: ['slice'],
                },
                {
                    type: 'widget',
                    pattern: 'apps/web/src/fsd/widgets/*',
                    partialMatch: false,
                    capture: ['slice'],
                },
                {
                    type: 'feature',
                    pattern: 'apps/web/src/fsd/features/*',
                    partialMatch: false,
                    capture: ['slice'],
                },
                {
                    type: 'entity',
                    pattern: 'apps/web/src/fsd/entities/*',
                    partialMatch: false,
                    capture: ['slice'],
                },
                {
                    type: 'shared',
                    pattern: 'apps/web/src/fsd/shared',
                    partialMatch: false,
                },
                {
                    type: 'other-frontend',
                    pattern: 'apps/admin/src',
                    partialMatch: false,
                },
            ],
            'boundaries/files': [
                {
                    category: 'next-framework',
                    pattern: [
                        'apps/web/instrumentation.ts',
                        'apps/web/instrumentation-client.ts',
                        'apps/web/proxy.ts',
                        'apps/web/src/instrumentation.ts',
                        'apps/web/src/instrumentation-client.ts',
                        'apps/web/src/proxy.ts',
                    ],
                },
            ],
            'boundaries/legacy-templates': false,
            'import/resolver': {
                typescript: {
                    noWarnOnMultipleProjects: true,
                    project: ['apps/web/tsconfig.json'],
                },
            },
        },
        rules: {
            'boundaries/dependencies': [
                'error',
                {
                    default: 'disallow',
                    policies: [
                        {
                            from: {
                                file: { categories: 'next-framework' },
                            },
                            allow: {
                                to: {
                                    element: {
                                        type: [
                                            'page',
                                            'widget',
                                            'feature',
                                            'entity',
                                            'shared',
                                        ],
                                    },
                                },
                            },
                        },
                        {
                            from: { element: { type: 'app' } },
                            allow: {
                                to: {
                                    element: {
                                        type: [
                                            'page',
                                            'widget',
                                            'feature',
                                            'entity',
                                            'shared',
                                        ],
                                    },
                                },
                            },
                        },
                        {
                            from: { element: { type: 'page' } },
                            allow: {
                                to: {
                                    element: {
                                        type: [
                                            'widget',
                                            'feature',
                                            'entity',
                                            'shared',
                                        ],
                                    },
                                },
                            },
                        },
                        {
                            from: { element: { type: 'widget' } },
                            allow: {
                                to: {
                                    element: {
                                        type: ['feature', 'entity', 'shared'],
                                    },
                                },
                            },
                        },
                        {
                            from: { element: { type: 'feature' } },
                            allow: {
                                to: {
                                    element: {
                                        type: ['entity', 'shared'],
                                    },
                                },
                            },
                        },
                        {
                            from: { element: { type: 'entity' } },
                            allow: {
                                to: {
                                    element: {
                                        type: 'shared',
                                    },
                                },
                            },
                        },
                        {
                            from: { element: { type: 'shared' } },
                            allow: {
                                to: {
                                    element: {
                                        type: 'shared',
                                    },
                                },
                            },
                        },
                    ],
                },
            ],
            'boundaries/no-unknown-files': 'error',
        },
    },
    {
        files: ['apps/admin/src/**/*.{ts,tsx}'],
        plugins: { boundaries },
        settings: {
            'boundaries/root-path': import.meta.dirname,
            'boundaries/elements': [
                {
                    type: 'admin-app',
                    pattern: 'apps/admin/src/app',
                    partialMatch: false,
                },
                {
                    type: 'admin-page',
                    pattern: 'apps/admin/src/pages/*',
                    partialMatch: false,
                    capture: ['slice'],
                },
                {
                    type: 'admin-widget',
                    pattern: 'apps/admin/src/widgets/*',
                    partialMatch: false,
                    capture: ['slice'],
                },
                {
                    type: 'admin-shared',
                    pattern: 'apps/admin/src/shared',
                    partialMatch: false,
                },
            ],
            'boundaries/files': [
                {
                    category: 'admin-entry',
                    pattern: [
                        'apps/admin/src/main.tsx',
                        'apps/admin/src/vite-env.d.ts',
                    ],
                },
            ],
            'boundaries/legacy-templates': false,
            'import/resolver': {
                typescript: {
                    noWarnOnMultipleProjects: true,
                    project: ['apps/admin/tsconfig.json'],
                },
            },
        },
        rules: {
            'boundaries/dependencies': [
                'error',
                {
                    default: 'disallow',
                    policies: [
                        {
                            from: { file: { categories: 'admin-entry' } },
                            allow: {
                                to: {
                                    element: {
                                        type: ['admin-app', 'admin-shared'],
                                    },
                                },
                            },
                        },
                        {
                            from: { element: { type: 'admin-app' } },
                            allow: {
                                to: {
                                    element: {
                                        type: [
                                            'admin-page',
                                            'admin-widget',
                                            'admin-shared',
                                        ],
                                    },
                                },
                            },
                        },
                        {
                            from: { element: { type: 'admin-page' } },
                            allow: {
                                to: {
                                    element: {
                                        type: [
                                            'admin-page',
                                            'admin-widget',
                                            'admin-shared',
                                        ],
                                    },
                                },
                            },
                        },
                        {
                            from: { element: { type: 'admin-widget' } },
                            allow: {
                                to: { element: { type: 'admin-shared' } },
                            },
                        },
                        {
                            from: { element: { type: 'admin-shared' } },
                            allow: {
                                to: { element: { type: 'admin-shared' } },
                            },
                        },
                    ],
                },
            ],
            'boundaries/no-unknown-files': 'error',
        },
    },
    eslintConfigPrettier,
);
