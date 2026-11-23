import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { KnowledgeBody as Body, LearningBlock } from '@languon/contracts';
import {
    GenerationRunPreviewSchema,
    GenerationRunSummarySchema,
} from '@languon/contracts';
import { KnowledgeBody } from '@/fsd/entities/knowledge';
import {
    LearningBlockView,
    exerciseActivityExamples,
    exerciseExampleLabels,
} from '@/fsd/entities/learning-blocks';
import { I18nProvider, useI18n } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { ru } from '@/fsd/shared/i18n/messages/ru';
import { LessonRunPreview } from './lesson-run-preview';

const examples = exerciseActivityExamples('en').filter((item) =>
    ['G01', 'G02', 'G03', 'G06'].includes(item.activity.id),
);
const grammar = examples[0]!.sources[0]!;
const run = GenerationRunSummarySchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
    noteId: '33333333-3333-4333-8333-333333333333',
    revision: 1,
    state: 'running',
    activeTurnId: '44444444-4444-4444-8444-444444444444',
    proposalId: null,
    completedTaskCount: 2,
    totalTaskCount: 3,
    chargedCredits: '1.250',
    tasks: [
        {
            id: 'reading',
            kind: 'prose',
            status: 'completed',
            label: 'La démocratie en France · Французский текст с переводом',
        },
        {
            id: 'grammar',
            kind: 'grammar',
            status: 'completed',
            label: 'Grammar reference',
        },
        {
            id: 'practice',
            kind: 'exercises',
            status: 'running',
            label: 'Grammar practice · four formats',
            completedUnitCount: 2,
            totalUnitCount: 4,
        },
    ],
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:01:00.000Z',
});

function blockBody(blocks: LearningBlock[]): Body {
    return {
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: blocks.map((block) => ({
                type: 'learningBlock',
                attrs: { block },
            })),
        },
    };
}

const preview = GenerationRunPreviewSchema.parse({
    runId: run.id,
    revision: 1,
    parts: [
        {
            taskId: 'reading',
            complete: true,
            completedUnitCount: 1,
            totalUnitCount: 1,
            body: {
                schemaVersion: 2,
                document: {
                    type: 'doc',
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: 'La démocratie française repose sur le débat public. Les citoyens participent aux élections et discutent des réformes.',
                                },
                            ],
                        },
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: 'Французская демократия опирается на публичную дискуссию. Граждане участвуют в выборах и обсуждают реформы.',
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            taskId: 'grammar',
            complete: true,
            completedUnitCount: 1,
            totalUnitCount: 1,
            body: blockBody([grammar]),
        },
        {
            taskId: 'practice',
            complete: false,
            completedUnitCount: 2,
            totalUnitCount: 4,
            body: blockBody(examples.slice(0, 2).map((item) => item.block)),
        },
    ],
});

function PreviewDocument({
    body,
    dependencies,
}: {
    body: Body;
    dependencies?: LearningBlock[];
}) {
    const { locale } = useI18n();
    function renderBlock(block: LearningBlock) {
        return (
            <LearningBlockView
                block={block}
                labels={exerciseExampleLabels(locale)}
                variant='learner'
                disclosureOnly
            />
        );
    }

    return (
        <KnowledgeBody
            body={body}
            {...(dependencies ? { dependencies } : {})}
            renderLearningBlock={renderBlock}
        />
    );
}

function renderBody(body: Body, dependencies?: LearningBlock[]) {
    return (
        <PreviewDocument
            body={body}
            {...(dependencies ? { dependencies } : {})}
        />
    );
}

function noAction() {}

const meta = {
    title: 'Features/Lesson generation/Prepared content',
    component: LessonRunPreview,
    decorators: [
        (Story, context) => {
            const locale =
                (context.parameters.locale ?? context.globals.locale) === 'ru'
                    ? 'ru'
                    : 'en';

            return (
                <I18nProvider
                    locale={locale}
                    messages={locale === 'ru' ? ru : en}
                >
                    <Story />
                </I18nProvider>
            );
        },
    ],
    args: {
        run,
        preview,
        open: true,
        loading: false,
        failed: false,
        onClose: noAction,
        onRetry: noAction,
        renderBody,
    },
} satisfies Meta<typeof LessonRunPreview>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Preparing: Story = {};
export const LargeMixedLesson: Story = {
    args: {
        preview: {
            ...preview,
            parts: preview.parts.map((part) =>
                part.taskId === 'practice'
                    ? {
                          ...part,
                          complete: true,
                          completedUnitCount: 4,
                          totalUnitCount: 4,
                          body: blockBody(examples.map((item) => item.block)),
                      }
                    : part,
            ),
        },
    },
};
export const Loading: Story = { args: { preview: undefined, loading: true } };
export const Failed: Story = { args: { preview: undefined, failed: true } };
export const AccessDenied: Story = {
    args: { preview: undefined, failed: true, accessDenied: true },
};
export const Empty: Story = {
    args: { preview: { runId: run.id, revision: 1, parts: [] } },
};
