import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { and, eq, sql } from 'drizzle-orm';
import {
    TextAlignmentSchema,
    TextLanguageSchema,
    TextSourceSchema,
    type TextAlignment,
    type TextDocument,
    type CopyKnowledgeTextRequest,
} from '@languon/contracts';
import type { TextContentContext } from './text-content-persistence-support';
import { revision, text } from './text-content-access';
import {
    textDocument,
    type TextsContentTransaction,
} from './text-content-support';
import { textsTable, textIdempotencyTable } from './schema';
import { TextDomainError, assertTextVersion } from '../../../domain/text';

export interface PreparedLibraryText {
    title: string;
    sourceLanguage: string;
    targetLanguage: string;
    sourceText: string;
    alignment: TextAlignment | null;
}

/** Preserves old pair identities; new independent pairs have already been assigned fresh IDs. */
export function appendLibraryAlignment(
    current: TextAlignment,
    added: TextAlignment,
): TextAlignment {
    const offset = current.source.reduce(
        (sum, segment) => sum + segment.text.length,
        0,
    );
    const paragraphOffset =
        Math.max(...current.source.map((segment) => segment.paragraphIndex)) +
        1;

    return TextAlignmentSchema.parse({
        source: [
            ...current.source,
            ...added.source.map((segment, index) => ({
                ...segment,
                text: index === 0 ? '\n\n' + segment.text : segment.text,
                startOffset:
                    offset + segment.startOffset + (index === 0 ? 0 : 2),
                endOffset: offset + segment.endOffset + 2,
                paragraphIndex: paragraphOffset + segment.paragraphIndex,
            })),
        ],
        translation: [
            ...current.translation,
            ...added.translation.map((segment, index) => ({
                ...segment,
                text: index === 0 ? '\n\n' + segment.text : segment.text,
            })),
        ],
        editedPairIds: [
            ...current.editedPairIds,
            ...added.source.map((segment) => segment.pairId),
        ],
    });
}

/** Untranslated drafts remain drafts; mixed aligned/untranslated append is explicit rejection. */
export function appendPreparedLibraryText(
    current: Pick<
        TextDocument,
        'sourceLanguage' | 'targetLanguage' | 'sourceText' | 'alignment'
    >,
    added: PreparedLibraryText,
) {
    if (
        current.sourceLanguage !== added.sourceLanguage ||
        current.targetLanguage !== added.targetLanguage
    )
        throw new TextDomainError(
            'invalid_request',
            'Append requires matching source and target languages.',
        );
    if (current.alignment && added.alignment) {
        const alignment = appendLibraryAlignment(
            current.alignment,
            added.alignment,
        );

        return {
            sourceText: alignment.source
                .map((segment) => segment.text)
                .join(''),
            alignment,
            status: 'edited' as const,
        };
    }

    if (!current.alignment && !added.alignment)
        return {
            sourceText: TextSourceSchema.parse(
                current.sourceText + '\n\n' + added.sourceText,
            ),
            alignment: null,
            status: 'draft' as const,
        };

    throw new TextDomainError(
        'invalid_request',
        'Cannot combine translated and untranslated text without preparing the missing translation.',
    );
}

/** Destination-owned atomic publication with a live, transaction-scoped source resolver. */
export async function publishLibraryText(
    persistence: TextContentContext,
    actorId: string,
    request: CopyKnowledgeTextRequest,
    fingerprint: string,
    signal: AbortSignal,
    resolve: (tx: TextsContentTransaction) => Promise<PreparedLibraryText>,
): Promise<TextDocument> {
    return persistence.db.transaction(async (tx) => {
        signal.throwIfAborted();
        const [actor] = await tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, actorId))
            .for('update');

        if (actor?.status !== 'active')
            throw new TextDomainError(
                'text_not_found',
                'The destination is unavailable.',
            );
        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`texts-idempotency:${actorId}:${request.operationId}`},0))`,
        );

        const [prior] = await tx
            .select()
            .from(textIdempotencyTable)
            .where(
                and(
                    eq(textIdempotencyTable.ownerId, actorId),
                    eq(textIdempotencyTable.key, request.operationId),
                ),
            );

        if (prior) {
            if (prior.fingerprint !== fingerprint)
                throw new TextDomainError(
                    'idempotency_conflict',
                    'This request key was already used.',
                );

            return textDocument(
                await text(persistence, tx, actorId, prior.result.id, false),
            );
        }

        const prepared = await resolve(tx);
        const sourceLanguage = TextLanguageSchema.parse(
            prepared.sourceLanguage,
        );
        const targetLanguage = TextLanguageSchema.parse(
            prepared.targetLanguage,
        );

        if (sourceLanguage === targetLanguage)
            throw new TextDomainError(
                'invalid_request',
                'Source and translation languages must differ.',
            );
        const alignment = prepared.alignment
            ? TextAlignmentSchema.parse(prepared.alignment)
            : null;
        const sourceText = TextSourceSchema.parse(prepared.sourceText);
        if (
            alignment &&
            alignment.source.map((segment) => segment.text).join('') !==
                sourceText
        )
            throw new TextDomainError(
                'invalid_request',
                'Source text and aligned segments must agree.',
            );
        const now = persistence.clock.now();
        let result: TextDocument;
        if (request.destination.kind === 'new') {
            const [created] = await tx
                .insert(textsTable)
                .values({
                    id: persistence.ids.generate(),
                    ownerId: actorId,
                    folderId: null,
                    title: request.destination.title,
                    sourceLanguage,
                    targetLanguage,
                    sourceText,
                    alignment,
                    status: alignment ? 'edited' : 'draft',
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();

            if (!created)
                throw new TextDomainError(
                    'version_conflict',
                    'Could not save the text.',
                );
            await revision(persistence, tx, created);
            result = textDocument(created);
        } else {
            const current = await text(
                persistence,
                tx,
                actorId,
                request.destination.textId,
            );

            assertTextVersion(
                current.version,
                request.destination.expectedVersion,
            );

            const appended = appendPreparedLibraryText(
                textDocument(current),
                prepared,
            );
            const [updated] = await tx
                .update(textsTable)
                .set({
                    ...appended,
                    version: current.version + 1,
                    updatedAt: now,
                })
                .where(eq(textsTable.id, current.id))
                .returning();

            if (!updated)
                throw new TextDomainError(
                    'version_conflict',
                    'The text changed. Preview again.',
                );
            await revision(persistence, tx, updated);
            result = textDocument(updated);
        }

        signal.throwIfAborted();
        await tx.insert(textIdempotencyTable).values({
            ownerId: actorId,
            key: request.operationId,
            fingerprint,
            result: { id: result.id },
            createdAt: now,
        });

        return result;
    });
}
