import { useState } from 'react';
import { Button } from '@/fsd/shared/ui';
import { LessonProposalReview } from '../lesson-proposal-review/lesson-proposal-review';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { ru } from '@/fsd/shared/i18n/messages/ru';
import styles from './content-proposal-preview.stories.module.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { KnowledgeContentProposalSchema } from '@languon/contracts';
import { ContentProposalPreview } from './content-proposal-preview';

const proposal = KnowledgeContentProposalSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
    noteId: '33333333-3333-4333-8333-333333333333',
    branchId: '44444444-4444-4444-8444-444444444444',
    baseBranchVersion: 1,
    lessonParts: [
        {
            taskId: 'reading',
            kind: 'prose',
            startIndex: 0,
            nodeCount: 2,
            present: false,
        },
        {
            taskId: 'grammar',
            kind: 'grammar',
            startIndex: 2,
            nodeCount: 2,
            present: false,
        },
    ],
    body: {
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'heading',
                    attrs: { level: 2 },
                    content: [
                        { type: 'text', text: 'La démocratie au quotidien' },
                    ],
                },
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: 'La démocratie repose sur la participation, le dialogue et la confiance. Les citoyens peuvent agir entre deux élections.',
                        },
                    ],
                },
                {
                    type: 'learningBlock',
                    attrs: {
                        block: {
                            id: '55555555-5555-4555-8555-555555555555',
                            type: 'grammar',
                            title: 'COD et COI',
                            language: 'fr',
                            rule: 'Le COD complète directement le verbe. Le COI est introduit par une préposition.',
                            examples: [
                                {
                                    text: 'Les citoyens discutent des réformes.',
                                },
                            ],
                        },
                    },
                },
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: 'Relisez les exemples et identifiez les compléments.',
                        },
                    ],
                },
            ],
        },
    },
    createdAt: '2026-11-16T10:00:00.000Z',
    appliedAt: null,
    appliedBranchVersion: null,
});
const meta = {
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
                    <div className={styles.canvas}>
                        <Story />
                    </div>
                </I18nProvider>
            );
        },
    ],
    title: 'Features/Knowledge/Complete mixed proposal',
    component: ContentProposalPreview,
    args: { proposal, variant: 'review' },
} satisfies Meta<typeof ContentProposalPreview>;

export default meta;
export const OrderedProseAndGrammar: StoryObj<typeof meta> = {};

export const CompletedLessonPanel: StoryObj<typeof meta> = {
    render: () => <LessonPanelExample />,
};
export const StaleDraftRecovery: StoryObj<typeof meta> = {
    render: () => <LessonPanelExample scenario='stale' />,
};

export const UnavailableCursorRecovery: StoryObj<typeof meta> = {
    render: () => <LessonPanelExample scenario='cursor' />,
};

function LessonPanelExample({ scenario }: { scenario?: 'stale' | 'cursor' }) {
    const [needsRefresh, setNeedsRefresh] = useState(scenario === 'stale');
    const [cursorUnavailable, setCursorUnavailable] = useState(false);
    const [open, setOpen] = useState(true);
    const [present, setPresent] = useState<string[]>([]);
    const [inserted, setInserted] = useState<{
        taskId: string | undefined;
        placement: 'end' | 'cursor';
    } | null>(null);

    return open ? (
        <LessonProposalReview
            proposal={proposal}
            application={{
                canInsertLesson: !needsRefresh,
                isPartPresent: (taskId) => present.includes(taskId),
                canInsertLessonAtCursor: true,
                busy: false,
                error: false,
                wrongBranch: false,
                isStale: needsRefresh,
                canRefreshLessonDraft: needsRefresh,
                cursorUnavailable,
                refreshLessonDraft: async () => setNeedsRefresh(false),
                lessonInsertStatus: inserted,
                insertLesson: async (taskId, placement) => {
                    const unavailable =
                        scenario === 'cursor' && placement === 'cursor';

                    setCursorUnavailable(unavailable);
                    setInserted(unavailable ? null : { taskId, placement });
                    if (!unavailable) {
                        setPresent((parts) =>
                            taskId
                                ? [...parts, taskId]
                                : (proposal.lessonParts ?? []).map(
                                      (part) => part.taskId,
                                  ),
                        );
                    }
                },
            }}
            onClose={() => setOpen(false)}
        />
    ) : (
        <Button onClick={() => setOpen(true)}>Review</Button>
    );
}
