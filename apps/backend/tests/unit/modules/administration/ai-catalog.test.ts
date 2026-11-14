import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getLocalPrompt, listLocalPrompts } from '@languon/prompts';
import {
    AdminAiCatalogDetailResponseSchema,
    AdminAiCatalogListResponseSchema,
    exerciseActivityCatalog,
    type AdminAiCatalogEntry,
} from '@languon/contracts';
import {
    getAiCatalogEntry,
    getAiCatalogSummaries,
} from '../../../../src/modules/administration/infrastructure/ai-catalog';
import { createAiCatalog } from '../../../../src/modules/administration/infrastructure/ai-catalog/registry';
import { ReadSourceContextDefinition } from '../../../../src/modules/conversations/infrastructure/ai/contextual-tutor-tools';
import { dictionaryCardAuthoringInstructions } from '../../../../src/modules/dictionaries/infrastructure/ai/dictionary-card-authoring-agent';
import { playgroundNamedExerciseToolDefinition } from '../../../../src/modules/development-harness/infrastructure/mastra/tutor-playground-primitives';

describe('read-only AI catalog composition', () => {
    it('requires factory metadata to participate in the catalog when a new agent or tool is added', () => {
        const sourceRoot = resolve('src');
        const registrations = ['agent-definitions.ts', 'tool-definitions.ts']
            .map((file) =>
                readFileSync(
                    join(
                        sourceRoot,
                        'modules/administration/infrastructure/ai-catalog',
                        file,
                    ),
                    'utf8',
                ),
            )
            .join('\n');
        const failures: string[] = [];
        function inspect(directory: string) {
            for (const entry of readdirSync(directory, {
                withFileTypes: true,
            })) {
                const file = join(directory, entry.name);
                if (entry.isDirectory()) {
                    inspect(file);
                    continue;
                }

                if (
                    !entry.name.endsWith('.ts') ||
                    entry.name.endsWith('.test.ts')
                ) {
                    continue;
                }

                const text = readFileSync(file, 'utf8');
                if (!/new Agent\(|createTool\(/u.test(text)) {
                    continue;
                }

                const ast = ts.createSourceFile(
                    file,
                    text,
                    ts.ScriptTarget.Latest,
                    true,
                );

                function visit(node: ts.Node) {
                    const constructor =
                        ts.isNewExpression(node) &&
                        node.expression.getText(ast) === 'Agent';
                    const tool =
                        ts.isCallExpression(node) &&
                        node.expression.getText(ast) === 'createTool';

                    if (constructor || tool) {
                        const call = node as
                            ts.NewExpression | ts.CallExpression;
                        const config = call.arguments?.[0];
                        const spread =
                            config && ts.isObjectLiteralExpression(config)
                                ? config.properties.find(
                                      (property) =>
                                          ts.isSpreadAssignment(property) &&
                                          /Definition/u.test(
                                              property.expression.getText(ast),
                                          ),
                                  )
                                : undefined;

                        if (!spread || !ts.isSpreadAssignment(spread)) {
                            failures.push(
                                `${file}: publish and spread a canonical definition`,
                            );
                        } else {
                            const symbol = spread.expression
                                .getText(ast)
                                .match(/^[A-Za-z][A-Za-z0-9_]*/u)?.[0];

                            if (!symbol || !registrations.includes(symbol)) {
                                failures.push(
                                    `${file}: register ${symbol} in the AI catalog`,
                                );
                            }
                        }
                    }

                    ts.forEachChild(node, visit);
                }

                visit(ast);
            }
        }

        inspect(sourceRoot);
        expect(failures).toEqual([]);
    });

    it('covers every checked-in prompt and every canonical module agent/tool registration with resolvable links', () => {
        const summaries = getAiCatalogSummaries();
        expect(
            AdminAiCatalogListResponseSchema.safeParse({ entries: summaries })
                .success,
        ).toBe(true);

        expect(
            new Set(summaries.map((entry) => `${entry.kind}:${entry.id}`)).size,
        ).toBe(summaries.length);

        for (const prompt of listLocalPrompts()) {
            const entry = getAiCatalogEntry('prompt', prompt.name);
            expect(entry).toMatchObject({
                kind: 'prompt',
                content: getLocalPrompt(prompt.name),
                sourcePath: prompt.sourcePath,
            });
        }

        for (const summary of summaries) {
            const entry = getAiCatalogEntry(summary.kind, summary.id);
            expect(
                AdminAiCatalogDetailResponseSchema.safeParse({ entry }).success,
            ).toBe(true);

            for (const ref of summary.references) {
                expect(getAiCatalogEntry(ref.kind, ref.id)).toBeDefined();
            }
        }
    });

    it('uses exact canonical static instructions and actual executable schemas', () => {
        expect(
            getAiCatalogEntry('agent', 'dictionary-card-authoring-agent'),
        ).toMatchObject({
            staticInstructions: [
                { text: dictionaryCardAuthoringInstructions() },
            ],
        });

        const tool = getAiCatalogEntry('tool', 'read_source_context');
        expect(tool).toMatchObject({
            inputSchema: z.toJSONSchema(
                ReadSourceContextDefinition.inputSchema,
                { unrepresentable: 'any', io: 'input' },
            ),
        });

        expect(
            getAiCatalogEntry(
                'agent',
                'contextual-language-tutor',
            )?.limitations.join(' '),
        ).toContain('appended dynamically');

        expect(
            getAiCatalogEntry('tool', 'generate_exercises')?.limitations.join(
                ' ',
            ),
        ).toContain('Custom refinements');
    });

    it('separates unused templates and development variants from application capabilities', () => {
        expect(getAiCatalogEntry('prompt', 'course-builder')).toMatchObject({
            scope: 'template',
            references: [],
        });

        expect(getAiCatalogEntry('tool', 'generate_vocabulary')).toMatchObject({
            scope: 'application',
        });

        expect(
            getAiCatalogEntry('tool', 'playground.generate_vocabulary'),
        ).toMatchObject({ scope: 'development', name: 'generate_vocabulary' });

        expect(
            getAiCatalogEntry('agent', 'development-verification-agent'),
        ).toMatchObject({ scope: 'development' });
    });

    it('returns detached values and no private execution context', () => {
        const entries = getAiCatalogSummaries();
        const first = entries[0]!;
        first.name = 'tampered';
        first.references.length = 0;
        expect(getAiCatalogSummaries()[0]?.name).not.toBe('tampered');
        const detail = getAiCatalogEntry('prompt', 'course-builder')!;
        detail.name = 'tampered';
        expect(getAiCatalogEntry('prompt', 'course-builder')?.name).toBe(
            'course-builder',
        );

        expect(getAiCatalogEntry('agent', 'not-an-agent')).toBeUndefined();
    });

    it('reflects all fixed named Studio tools as guarded development metadata without attaching them to the actor', () => {
        const entries = getAiCatalogSummaries().filter(
            (entry) =>
                entry.kind === 'tool' &&
                entry.name.startsWith('generate_exercise_'),
        );

        expect(entries).toHaveLength(19);
        const actor = getAiCatalogEntry('agent', 'contextual-language-tutor');
        expect(
            actor?.references.filter(
                (ref) =>
                    ref.kind === 'tool' &&
                    ref.id.includes('generate_exercise_'),
            ),
        ).toEqual([]);

        for (const activity of exerciseActivityCatalog) {
            const definition = playgroundNamedExerciseToolDefinition(
                activity.id,
            );
            const detail = getAiCatalogEntry(
                'tool',
                `playground.${definition.id}`,
            );

            if (detail?.kind !== 'tool') {
                throw new Error(
                    'Named playground tool is absent from the catalog.',
                );
            }

            expect(detail).toMatchObject({
                scope: 'development',
                module: 'development-harness',
                name: definition.id,
                references: expect.arrayContaining([
                    { kind: 'prompt', id: 'learning-content-authoring' },
                ]),
            });

            expect(detail?.limitations.join(' ')).toContain(
                'Catalog visibility does not make this tool executable',
            );

            expect(detail?.limitations.join(' ')).toContain(
                'not attached to the tutor actor',
            );

            expect(detail?.inputSchema).toEqual(
                z.toJSONSchema(definition.inputSchema, {
                    unrepresentable: 'any',
                    io: 'input',
                }),
            );

            expect(detail?.outputSchema).toEqual(
                z.toJSONSchema(definition.outputSchema, {
                    unrepresentable: 'any',
                    io: 'output',
                }),
            );

            expect(detail?.requestContextSchema).toEqual(
                z.toJSONSchema(definition.requestContextSchema, {
                    unrepresentable: 'any',
                    io: 'input',
                }),
            );

            expect(detail?.inputSchema).toMatchObject({
                additionalProperties: false,
                properties: { count: { default: 5 } },
            });

            for (const field of [
                'activityId',
                'activities',
                'formats',
                'checkingPolicy',
                'ownerId',
                'model',
            ]) {
                expect(detail?.inputSchema).not.toHaveProperty(
                    `properties.${field}`,
                );
            }

            expect(getAiCatalogEntry('tool', definition.id)).toBeUndefined();
        }
    });

    it('accepts future registrations without changing query or UI code and rejects broken registration', () => {
        const future: AdminAiCatalogEntry = {
            id: 'future-agent',
            kind: 'agent',
            name: 'Future agent',
            description: 'Synthetic metadata.',
            module: 'future',
            scope: 'application',
            references: [],
            staticInstructions: [
                { label: 'System', text: 'Synthetic system template.' },
            ],
            limitations: [],
        };

        expect(
            createAiCatalog([future]).entry('agent', 'future-agent'),
        ).toEqual(future);

        expect(() => createAiCatalog([future, future])).toThrow('Duplicate');
        expect(() =>
            createAiCatalog([
                { ...future, references: [{ kind: 'tool', id: 'missing' }] },
            ]),
        ).toThrow('Unresolved');
    });
});
