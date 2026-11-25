import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendSource = fileURLToPath(
    new URL('../apps/backend/src/', import.meta.url),
);
// Package roots also match their SDK-specific subpath exports.
const adapterPackages = new Set([
    '@languon/database',
    'drizzle-orm',
    'postgres',
    'pg',
    'ioredis',
    'redis',
    'hono',
    'langfuse',
    'ai',
    'openai',
    'jose',
    '@node-rs/argon2',
]);
const adapterScopes = new Set([
    '@hono',
    '@mastra',
    '@langfuse',
    '@ai-sdk',
    '@aws-sdk',
    '@simplewebauthn',
    '@anthropic-ai',
]);

function importsAdapter(source) {
    const [root, name] = source.split('/');
    const packageName = root.startsWith('@') ? root + '/' + name : root;

    return adapterScopes.has(root) || adapterPackages.has(packageName);
}

function backendLayer(path) {
    const [area, , moduleLayer] = relative(backendSource, path).split(sep);

    return area === 'modules' ? moduleLayer : area;
}

const inwardDependencies = {
    meta: {
        type: 'problem',
        schema: [],
        messages: {
            outward:
                'The {{layer}} layer cannot depend on {{source}}. Inject the operation through a domain or application port.',
        },
    },
    create(context) {
        const file = context.filename;
        const layer = backendLayer(file);

        function check(node) {
            const source = node?.value;
            if (typeof source !== 'string') {
                return;
            }

            const target = source.startsWith('.')
                ? backendLayer(resolve(dirname(file), source))
                : undefined;

            if (
                importsAdapter(source) ||
                ['config', 'mastra', 'infrastructure', 'interface'].includes(
                    target,
                ) ||
                (layer === 'domain' && target === 'application')
            ) {
                context.report({
                    node,
                    messageId: 'outward',
                    data: { layer, source },
                });
            }
        }

        return {
            'ImportDeclaration, ExportAllDeclaration, ExportNamedDeclaration, ImportExpression, TSImportType'(
                node,
            ) {
                check(node.source);
            },
        };
    },
};

export const backendBoundariesConfig = {
    files: ['apps/backend/src/modules/*/{application,domain}/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    plugins: {
        'backend-ddd': { rules: { 'inward-dependencies': inwardDependencies } },
    },
    rules: { 'backend-ddd/inward-dependencies': 'error' },
};
