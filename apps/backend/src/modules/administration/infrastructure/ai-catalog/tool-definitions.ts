import type { z } from 'zod';
import {
    ReadSourceContextDefinition,
    ProposeKnowledgeNoteDefinition,
} from '../../../conversations/infrastructure/ai/contextual-tutor-tools';
import {
    ProposeDictionarySnippetDefinition,
    ReadDictionarySnippetDefinition,
} from '../../../conversations/infrastructure/ai/dictionary-snippet-tools';
import { RecallDefinition } from '../../../conversations/infrastructure/ai/tutor-history-tool';
import { learningContentToolDefinition } from '../../../conversations/infrastructure/ai/learning-content-tools';
import { DevelopmentPrincipalVerificationDefinition } from '../../../development-harness/infrastructure/mastra/development-harness-primitives';
import {
    ReadPlaygroundProposalDefinition,
    playgroundContentToolDefinition,
} from '../../../development-harness/infrastructure/mastra/tutor-playground-primitives';

export interface CatalogToolRegistration {
    definition: {
        id: string;
        description: string;
        inputSchema?: z.ZodType;
        outputSchema?: z.ZodType;
        requestContextSchema?: z.ZodType;
    };
    module: string;
    scope: 'application' | 'development';
    catalogId?: string;
    limitations: readonly string[];
    promptIds?: readonly string[];
}
const authority =
    'Execution is operation-bound and conditional on server authorization. Catalog visibility does not make this tool executable.';

export const catalogToolRegistrations: readonly CatalogToolRegistration[] = [
    ...[
        ReadSourceContextDefinition,
        ProposeKnowledgeNoteDefinition,
        ProposeDictionarySnippetDefinition,
        ReadDictionarySnippetDefinition,
        RecallDefinition,
    ].map((definition) => ({
        definition,
        module: 'conversations',
        scope: 'application' as const,
        limitations: [authority],
    })),
    ...(['vocabulary', 'grammar', 'bilingual-text', 'exercises'] as const).map(
        (kind) => ({
            definition: learningContentToolDefinition(kind),
            module: 'conversations',
            scope: 'application' as const,
            promptIds: ['learning-content-authoring'],
            limitations: [
                authority,
                'Generation uses the shared accounted authoring pipeline; the returned receipt refers to separately stored reviewable content.',
            ],
        }),
    ),
    {
        definition: DevelopmentPrincipalVerificationDefinition,
        module: 'development-harness',
        scope: 'development',
        limitations: [
            'Requires the synthetic principal request-context preset and isolated playground persistence.',
        ],
    },
    ...(['vocabulary', 'grammar', 'bilingual-text', 'exercises'] as const).map(
        (kind) => ({
            definition: playgroundContentToolDefinition(kind),
            catalogId: `playground.${playgroundContentToolDefinition(kind).id}`,
            module: 'development-harness',
            scope: 'development' as const,
            promptIds: ['learning-content-authoring'],
            limitations: [
                'Studio adapter around the canonical generation operation; its return envelope additionally exposes synthetic diagnostics and proposal readback.',
                'Deterministic mode supplies fixture model responses; live mode requires reviewed playground configuration.',
            ],
        }),
    ),
    {
        definition: ReadPlaygroundProposalDefinition,
        module: 'development-harness',
        scope: 'development',
        limitations: [
            'Only reads a proposal belonging to the selected isolated synthetic session.',
        ],
    },
];
