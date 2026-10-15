import { eq } from 'drizzle-orm';
import type { TextSelectionRequest } from '@languon/contracts';
import { textSharesTable } from '../../../../texts/infrastructure/persistence/drizzle/schema';
import {
    resolveTextSource,
    assertTextSourceAuthority,
} from '../../../../texts/infrastructure/persistence/drizzle/text-source-resolver';
import type { SelectionTransaction } from './text-selection-target';
import type {
    SelectionSourceAuthority,
    SelectionSourceDocument,
} from '../../../application/ports/text-selection-store';
import { TextSelectionError } from '../../../domain/text-selection';
export interface SelectionSourceOptions {
    verifyShare: (key: string, digest: string) => Promise<boolean> | boolean;
    proposal: (
        tx: SelectionTransaction,
        input: { ownerId: string; jobId: string; now: Date },
    ) => Promise<{
        alignment: SelectionSourceDocument['alignment'];
        sourceLanguage: string;
        targetLanguage: string;
    }>;
}
export async function resolveSelectionSource(
    tx: SelectionTransaction,
    options: SelectionSourceOptions,
    ownerId: string,
    source: TextSelectionRequest['source'],
    shareKey: string | undefined,
    now: Date,
): Promise<SelectionSourceDocument> {
    if (source.kind === 'translation-proposal') {
        const proposal = await options.proposal(tx, {
            ownerId,
            jobId: source.jobId,
            now,
        });
        return {
            ...proposal,
            sourceOwnerId: ownerId,
            authority: {
                kind: 'translation-proposal',
                ownerId,
                jobId: source.jobId,
            },
        };
    }
    let share;
    if (source.kind === 'shared-text') {
        if (!shareKey) throw new TextSelectionError('not_found');
        const [row] = await tx
            .select()
            .from(textSharesTable)
            .where(eq(textSharesTable.locator, source.shareId))
            .limit(1);
        if (!row) throw new TextSelectionError('not_found');
        share = { kind: row.kind, locator: source.shareId, key: shareKey };
    }
    const result = await resolveTextSource(
        tx,
        {
            actorId: ownerId,
            textId: source.textId,
            version: source.expectedTextVersion,
            ...(share ? { share } : {}),
        },
        options.verifyShare,
    );
    if (!result.document.alignment)
        throw new TextSelectionError('stale_content');
    return {
        sourceOwnerId: result.sourceOwnerId,
        alignment: result.document.alignment,
        sourceLanguage: result.document.sourceLanguage,
        targetLanguage: result.document.targetLanguage,
        authority: { kind: 'text', ...result.authority },
    };
}
export async function assertSelectionSource(
    tx: SelectionTransaction,
    options: SelectionSourceOptions,
    authority: SelectionSourceAuthority,
    now: Date,
) {
    if (authority.kind === 'text')
        await assertTextSourceAuthority(tx, authority);
    else
        await options.proposal(tx, {
            ownerId: authority.ownerId,
            jobId: authority.jobId,
            now,
        });
}
