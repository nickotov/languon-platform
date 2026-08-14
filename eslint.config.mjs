import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            '**/.next/**',
            '**/.turbo/**',
            '**/coverage/**',
            '**/dist/**',
            '**/node_modules/**',
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
            'apps/{web,admin}/src/**/*.{ts,tsx}',
            'apps/{web,admin}/{instrumentation,instrumentation-client,proxy}.ts',
        ],
        plugins: {
            boundaries,
        },
        settings: {
            'boundaries/elements': [
                {
                    type: 'app',
                    pattern: 'apps/*/src/app',
                    partialMatch: false,
                    capture: ['application'],
                },
                {
                    type: 'page',
                    pattern: 'apps/*/src/fsd/pages/*',
                    partialMatch: false,
                    capture: ['application', 'slice'],
                },
                {
                    type: 'widget',
                    pattern: 'apps/*/src/fsd/widgets/*',
                    partialMatch: false,
                    capture: ['application', 'slice'],
                },
                {
                    type: 'feature',
                    pattern: 'apps/*/src/fsd/features/*',
                    partialMatch: false,
                    capture: ['application', 'slice'],
                },
                {
                    type: 'entity',
                    pattern: 'apps/*/src/fsd/entities/*',
                    partialMatch: false,
                    capture: ['application', 'slice'],
                },
                {
                    type: 'shared',
                    pattern: 'apps/*/src/fsd/shared',
                    partialMatch: false,
                    capture: ['application'],
                },
            ],
            'boundaries/files': [
                {
                    category: 'next-framework',
                    pattern: [
                        'apps/*/instrumentation.ts',
                        'apps/*/instrumentation-client.ts',
                        'apps/*/proxy.ts',
                        'apps/*/src/instrumentation.ts',
                        'apps/*/src/instrumentation-client.ts',
                        'apps/*/src/proxy.ts',
                    ],
                    capture: ['application'],
                },
            ],
            'boundaries/legacy-templates': false,
            'import/resolver': {
                typescript: {
                    noWarnOnMultipleProjects: true,
                    project: [
                        'apps/web/tsconfig.json',
                        'apps/admin/tsconfig.json',
                    ],
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
                                        captured: {
                                            application:
                                                '{{from.file.captured.application}}',
                                        },
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
                                        captured: {
                                            application:
                                                '{{from.element.captured.application}}',
                                        },
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
                                        captured: {
                                            application:
                                                '{{from.element.captured.application}}',
                                        },
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
                                        captured: {
                                            application:
                                                '{{from.element.captured.application}}',
                                        },
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
                                        captured: {
                                            application:
                                                '{{from.element.captured.application}}',
                                        },
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
                                        captured: {
                                            application:
                                                '{{from.element.captured.application}}',
                                        },
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
                                        captured: {
                                            application:
                                                '{{from.element.captured.application}}',
                                        },
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
    eslintConfigPrettier,
);
