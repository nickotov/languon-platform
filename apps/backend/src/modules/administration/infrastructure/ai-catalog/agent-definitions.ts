import { DictionaryCardGenerationAgentDefinition } from '../../../dictionaries/infrastructure/ai/dictionary-card-generation-agent';
import { DictionaryCardAuthoringAgentDefinition } from '../../../dictionaries/infrastructure/ai/dictionary-card-authoring-agent';
import { DictionaryPastedTermsGenerationAgentDefinition } from '../../../dictionaries/infrastructure/ai/dictionary-pasted-terms-generation-agent';
import { DictionaryImportPairsGenerationAgentDefinition } from '../../../dictionaries/infrastructure/ai/dictionary-import-pairs-generation-agent';
import { textAgentDefinition } from '../../../texts/infrastructure/ai/texts-agents';
import { sentenceAgentDefinition } from '../../../learning/infrastructure/ai/sentence-agents';
import { knowledgeActionAgentDefinition } from '../../../knowledge/infrastructure/ai/knowledge-action-agents';
import { LearnerInterviewerDefinition } from '../../../learner-portraits/infrastructure/ai/learner-interviewer';
import { ContextualLanguageTutorDefinition } from '../../../conversations/infrastructure/ai/contextual-tutor-configuration';
import { tutorRequestAgentDefinitions } from '../../../conversations/infrastructure/ai/tutor-request-agents';
import { DevelopmentVerificationAgentDefinition } from '../../../development-harness/infrastructure/mastra/development-harness-primitives';
import { AdminTextAiProbeDefinition } from '../../../text-ai/infrastructure/ai/text-ai-probe-executor';
import type { LocalPromptName } from '@languon/prompts';

export interface CatalogAgentRegistration {
    definition: { id: string; name: string; instructions: string };
    module: string;
    scope: 'application' | 'development';
    promptIds: readonly LocalPromptName[];
    toolIds: readonly string[];
    limitations: readonly string[];
}

const operationBound =
    'Availability is conditional on the authenticated operation; listing does not grant execution authority.';

/** Register new canonical descriptors here; admin rendering and HTTP contracts need no per-agent edits. */
export const catalogAgentRegistrations: readonly CatalogAgentRegistration[] = [
    ...[
        DictionaryCardGenerationAgentDefinition,
        DictionaryCardAuthoringAgentDefinition,
        DictionaryPastedTermsGenerationAgentDefinition,
        DictionaryImportPairsGenerationAgentDefinition,
    ].map((definition) => ({
        definition,
        module: 'dictionaries',
        scope: 'application' as const,
        promptIds: [definition.id as LocalPromptName],
        toolIds: [],
        limitations: [
            operationBound,
            'Structured operation data is provided at execution and is not included in this catalog.',
        ],
    })),
    ...(['text-translation-agent', 'text-detection-agent'] as const).map(
        (id) => ({
            definition: textAgentDefinition(id),
            module: 'texts',
            scope: 'application' as const,
            promptIds: [id],
            toolIds: [],
            limitations: [operationBound],
        }),
    ),
    ...(['sentence-generation-agent', 'sentence-check-agent'] as const).map(
        (id) => ({
            definition: sentenceAgentDefinition(id),
            module: 'learning',
            scope: 'application' as const,
            promptIds: [id],
            toolIds: [],
            limitations: [operationBound],
        }),
    ),
    ...(
        [
            'knowledge-block-field-agent',
            'knowledge-exercise-evaluation-agent',
        ] as const
    ).map((id) => ({
        definition: knowledgeActionAgentDefinition(id),
        module: 'knowledge',
        scope: 'application' as const,
        promptIds: [id],
        toolIds: [],
        limitations: [
            operationBound,
            'The source-bound exercise/field, learner response and rubric are request data and are excluded.',
        ],
    })),
    {
        definition: LearnerInterviewerDefinition,
        module: 'learner-portraits',
        scope: 'application',
        promptIds: ['learner-interviewer'],
        toolIds: [],
        limitations: [
            operationBound,
            'The current interview state and approved learner information are supplied at execution and excluded.',
        ],
    },
    {
        definition: ContextualLanguageTutorDefinition,
        module: 'conversations',
        scope: 'application',
        promptIds: ['contextual-language-tutor'],
        toolIds: [
            'read_source_context',
            'propose_knowledge_note',
            'propose_dictionary_snippet',
            'read_dictionary_snippet',
            'recall',
            'generate_vocabulary',
            'generate_grammar',
            'generate_bilingual_text',
            'generate_exercises',
        ],
        limitations: [
            operationBound,
            'Server-created context instructions, preferences, authorized source material and conversation memory are appended dynamically and excluded.',
            'The listed tools are possible capabilities; the server attaches only those permitted for the current source and action.',
            'Observational memory uses instructions owned by the installed Mastra memory SDK; these are not application-authored prompt templates.',
        ],
    },
    ...Object.values(tutorRequestAgentDefinitions).map((definition) => ({
        definition,
        module: 'conversations',
        scope: 'application' as const,
        promptIds: [
            (
                {
                    'tutor-request-resolver': 'tutor-request-resolution',
                    'dictionary-snippet-author':
                        'dictionary-chat-snippet-authoring',
                    'learning-content-author': 'learning-content-authoring',
                } as const
            )[definition.id as keyof typeof tutorRequestAgentDefinitions],
        ],
        toolIds: [],
        limitations: [
            operationBound,
            'Selected capabilities, exact source material, pending plans and output schemas are supplied by the host at execution and excluded.',
        ],
    })),
    {
        definition: DevelopmentVerificationAgentDefinition,
        module: 'development-harness',
        scope: 'development',
        promptIds: ['development-harness-agent'],
        toolIds: ['development-principal-verification'],
        limitations: [
            'Development-only verification primitive; not the full learning tutor.',
            'The selected response variant is appended from validated request context at runtime.',
        ],
    },
    {
        definition: AdminTextAiProbeDefinition,
        module: 'text-ai',
        scope: 'application',
        promptIds: [],
        toolIds: [],
        limitations: [
            operationBound,
            'The displayed instruction is the quick connectivity check. Flow checks replace it with the selected synthetic flow contract instructions and output schema; they are not learner prompts.',
        ],
    },
];
