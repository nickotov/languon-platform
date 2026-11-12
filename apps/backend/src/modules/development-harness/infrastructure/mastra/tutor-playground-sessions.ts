import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
    KnowledgeNoteContentSchema,
    type LearningBlock,
} from '@languon/contracts';
import type { ConversationsDatabase } from '../../../conversations/infrastructure/persistence/drizzle/conversation-source';
import type { DrizzleConversationStore } from '../../../conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { conversationsTable } from '../../../conversations/infrastructure/persistence/drizzle/schema';
import {
    knowledgeNotesTable,
    knowledgeWorkingBranchesTable,
} from '../../../knowledge/infrastructure/persistence/drizzle/schema';
import { DrizzleKnowledgeTransactionParticipant } from '../../../knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { developmentHarnessFixture } from '../development-fixture';
import { playgroundBlock } from './tutor-playground-model';
import type { TutorPlaygroundContext } from './tutor-playground-contract';

export const playgroundAccess = {
    ownerId: developmentHarnessFixture.principalId,
};
const access = playgroundAccess;
const titleFor = (scenario: string) => `Mastra playground: ${scenario}`;

export function createPlaygroundSessions(
    database: ConversationsDatabase,
    store: DrizzleConversationStore,
) {
    async function session(context: TutorPlaygroundContext) {
        if (context.sessionId) {
            const [chat] = await database
                .select()
                .from(conversationsTable)
                .where(
                    and(
                        eq(conversationsTable.id, context.sessionId),
                        eq(conversationsTable.ownerId, access.ownerId),
                    ),
                );

            if (
                !chat ||
                chat.title !== titleFor(context.scenarioId) ||
                chat.source.kind !== 'knowledge'
            ) {
                throw new Error(
                    'This synthetic session is unavailable for the selected scenario.',
                );
            }

            return { conversationId: chat.id, noteId: chat.source.id };
        }

        const blocks: LearningBlock[] =
            context.scenarioId === 'grammar-revision'
                ? playgroundBlock({
                      id: 'seed',
                      kind: 'grammar',
                      instruction: 'Synthetic grammar fixture',
                      language: 'en',
                  })
                : context.scenarioId === 'vocabulary-follow-up'
                  ? playgroundBlock({
                        id: 'seed',
                        kind: 'vocabulary',
                        instruction: 'Synthetic vocabulary fixture',
                        language: 'en',
                        translationLanguage: 'es',
                        count: 3,
                    })
                  : [];
        const content = KnowledgeNoteContentSchema.parse({
            title: titleFor(context.scenarioId),
            summary: 'Isolated synthetic source for Mastra testing.',
            categories: [],
            studiedLanguage:
                context.scenarioId === 'missing-language' ? null : 'en',
            explanationLanguage: 'en',
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
                                    text: 'Synthetic learning source: a river runs beside the garden.',
                                },
                            ],
                        },
                        ...blocks.map((block) => ({
                            type: 'learningBlock',
                            attrs: { block },
                        })),
                    ],
                },
            },
        });
        const note = await database.transaction((tx) =>
            new DrizzleKnowledgeTransactionParticipant(tx).publish(
                access.ownerId,
                { operationId: randomUUID(), content },
            ),
        );
        const chat = await store.create(access, {
            source: {
                kind: 'knowledge',
                id: note.id,
                ...(context.scenarioId === 'read-only'
                    ? { view: 'saved' as const }
                    : {}),
            },
            preferences: {
                mode: 'auto',
                replyLanguage: 'en',
                tone: 'neutral',
                explanationLevel: 'auto',
            },
        });

        await store.update(access, chat.id, {
            title: titleFor(context.scenarioId),
        });

        return { conversationId: chat.id, noteId: note.id };
    }

    async function editor(noteId: string) {
        const [note] = await database
            .select()
            .from(knowledgeNotesTable)
            .where(
                and(
                    eq(knowledgeNotesTable.id, noteId),
                    eq(knowledgeNotesTable.ownerId, access.ownerId),
                ),
            );

        if (!note?.preferredBranchId) {
            throw new Error('The synthetic source is unavailable.');
        }

        const [branch] = await database
            .select()
            .from(knowledgeWorkingBranchesTable)
            .where(
                eq(knowledgeWorkingBranchesTable.id, note.preferredBranchId),
            );

        if (!branch) {
            throw new Error('The synthetic working branch is unavailable.');
        }

        const text = JSON.stringify(branch.content.body);

        return {
            content: text,
            workingBranch: { id: branch.id, version: branch.version },
            editorTarget: {
                documentHash: createHash('sha256').update(text).digest('hex'),
                from: text.length,
                to: text.length,
                originalText: '',
            },
        };
    }

    return {
        session,
        editor,
        async readProposal(input: { sessionId: string; proposalId: string }) {
            const [chat] = await database
                .select()
                .from(conversationsTable)
                .where(
                    and(
                        eq(conversationsTable.id, input.sessionId),
                        eq(conversationsTable.ownerId, access.ownerId),
                    ),
                );

            if (!chat?.title?.startsWith('Mastra playground: ')) {
                throw new Error('This synthetic session is unavailable.');
            }

            const result = await store.listBlockProposals(
                access,
                input.sessionId,
            );
            const proposal = result.proposals.find(
                (item) => item.id === input.proposalId,
            );

            if (!proposal) {
                throw new Error(
                    'This proposal is unavailable in the selected session.',
                );
            }

            return { sessionId: input.sessionId, proposal };
        },
    };
}
