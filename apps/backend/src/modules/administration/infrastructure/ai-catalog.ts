import { listLocalPrompts } from '@languon/prompts';
import { z } from 'zod';
import type {
    AdminAiCatalogEntry,
    AdminAiCatalogKind,
    AdminAiCatalogReference,
} from '@languon/contracts';
import { catalogAgentRegistrations } from './ai-catalog/agent-definitions';
import { catalogToolRegistrations } from './ai-catalog/tool-definitions';
import { createAiCatalog } from './ai-catalog/registry';

const schemaNotice =
    'JSON Schema describes structural validation. Custom refinements and transforms may not have a JSON Schema equivalent; the canonical Zod runtime schema remains authoritative.';

function inspectSchema(
    schema: z.ZodType | undefined,
    limitations: string[],
    label: string,
) {
    if (!schema) {
        limitations.push(
            `${label} schema is not published by this definition.`,
        );

        return null;
    }

    try {
        return z.toJSONSchema(schema, {
            unrepresentable: 'any',
            io: label === 'Output' ? 'output' : 'input',
        }) as Record<string, z.infer<ReturnType<typeof z.json>>>;
    } catch {
        limitations.push(
            `${label} schema could not be represented in JSON Schema; it remains defined and enforced in the executable tool.`,
        );

        return null;
    }
}

/** Composition imports canonical descriptors, never creates agents or operation-bound tools. */
function buildCatalog() {
    const entries: AdminAiCatalogEntry[] = [];
    for (const registration of catalogAgentRegistrations) {
        const { definition, module, scope, limitations, promptIds, toolIds } =
            registration;

        entries.push({
            id: definition.id,
            kind: 'agent',
            name: definition.name,
            description: `${definition.name} (${module}).`,
            module,
            scope,
            references: [
                ...promptIds.map((id) => ({ kind: 'prompt' as const, id })),
                ...toolIds.map((id) => ({ kind: 'tool' as const, id })),
            ],
            staticInstructions: [
                {
                    label: 'Static system instructions',
                    text: definition.instructions,
                },
            ],
            limitations: [...limitations],
        });
    }

    for (const registration of catalogToolRegistrations) {
        const { definition, module, scope } = registration;
        const limitations = [...registration.limitations, schemaNotice];
        entries.push({
            id: registration.catalogId ?? definition.id,
            kind: 'tool',
            name: definition.id,
            description: definition.description,
            module,
            scope,
            references: (registration.promptIds ?? []).map((id) => ({
                kind: 'prompt' as const,
                id,
            })),
            inputSchema: inspectSchema(
                definition.inputSchema,
                limitations,
                'Input',
            ),
            outputSchema: inspectSchema(
                definition.outputSchema,
                limitations,
                'Output',
            ),
            requestContextSchema: definition.requestContextSchema
                ? inspectSchema(
                      definition.requestContextSchema,
                      limitations,
                      'Request context',
                  )
                : null,
            limitations,
        });
    }

    for (const prompt of listLocalPrompts()) {
        const consumers = entries.filter((entry) =>
            entry.references.some(
                (ref) => ref.kind === 'prompt' && ref.id === prompt.name,
            ),
        );
        const scope = consumers.some((entry) => entry.scope === 'application')
            ? 'application'
            : consumers.length
              ? 'development'
              : 'template';

        entries.push({
            id: prompt.name,
            kind: 'prompt',
            name: prompt.name,
            description: prompt.content.split('\n')[0]!.slice(0, 240),
            module: consumers[0]?.module ?? 'prompts',
            scope,
            references: [],
            content: prompt.content,
            sourcePath: prompt.sourcePath,
            limitations:
                scope === 'template'
                    ? [
                          'Checked-in template with no registered agent/tool consumer. Its presence does not imply an implemented product capability.',
                      ]
                    : [
                          'Checked-in local template. Final operation input additionally contains host-provided context, schemas and data; those values are not part of this catalog.',
                      ],
        });
    }

    // Connections are symmetric for navigation, while identities retain their kind.
    const index = new Map(
        entries.map((entry) => [`${entry.kind}:${entry.id}`, entry]),
    );

    for (const entry of entries) {
        for (const ref of [...entry.references]) {
            const target = index.get(`${ref.kind}:${ref.id}`);
            const reverse: AdminAiCatalogReference = {
                kind: entry.kind,
                id: entry.id,
            };

            if (
                target &&
                !target.references.some(
                    (item) =>
                        item.kind === reverse.kind && item.id === reverse.id,
                )
            ) {
                target.references.push(reverse);
            }
        }
    }

    return createAiCatalog(
        entries.sort(
            (a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
        ),
    );
}

const catalog = buildCatalog();
export function getAiCatalogSummaries() {
    return catalog.summaries();
}

export function getAiCatalogEntry(kind: AdminAiCatalogKind, id: string) {
    return catalog.entry(kind, id);
}
