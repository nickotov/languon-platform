import { formatCreditMilli } from '../../../../ai-credits/domain/exact-credit-amount';
import { dictionaryAiWorkerObservationsTable as workers } from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { and, eq, gt, sql } from 'drizzle-orm';
import {
    KnowledgeTranscriptionJobSchema,
    ProviderPriceSchema,
    nativeProviderPricingMatchesMeter,
} from '@languon/contracts';
import {
    TRANSCRIPTION_DATA_SHARING_ATTESTATION_MS,
    isApprovedTranscriptionProcessingRevision,
} from '../../../domain/transcription-processing-policy';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import type {
    KnowledgeDatabase,
    KnowledgeTransaction,
} from './knowledge-transaction';
import {
    getOwnedKnowledgeRow,
    lockKnowledgeOwner,
} from './knowledge-transaction';
import {
    knowledgeMediaAssetsTable as assets,
    knowledgeMediaBlobsTable as blobs,
} from './media-schema';
import {
    knowledgeTranscriptionJobsTable as jobs,
    knowledgeTranscriptionStateTable as state,
    knowledgeTranscriptionConfigRevisionsTable as configs,
} from './transcription-accounting-schema';
import { aiProviderPriceRevisionsTable as prices } from '../../../../ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { evaluateNativeProviderCost } from '../../../../ai-credits/domain/native-provider-pricing';

export interface TranscriptionContext {
    database: KnowledgeDatabase;
    clock: { now(): Date };
    credentialFingerprint?: string | null;
}
export type TranscriptionJobRow = typeof jobs.$inferSelect;
export function transcriptionUnavailable(
    message = 'Audio transcription is not configured for safe execution.',
) {
    return new KnowledgeDomainError('service_unavailable', message);
}

export function transcriptionJob(row: TranscriptionJobRow) {
    return KnowledgeTranscriptionJobSchema.parse({
        id: row.id,
        noteId: row.noteId,
        assetId: row.assetId,
        state: row.state,
        maximumCredits: formatCreditMilli(row.maximumCreditsMilli),
        result: row.result
            ? { text: row.result.text, languages: row.result.languages }
            : null,
        failureCode: row.failureCode,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    });
}

export async function ownedTranscriptionAudio(
    tx: KnowledgeTransaction,
    ownerId: string,
    noteId: string,
    assetId: string,
) {
    await getOwnedKnowledgeRow(tx, ownerId, noteId);
    const [source] = await tx
        .select({ asset: assets, blob: blobs })
        .from(assets)
        .innerJoin(blobs, eq(assets.blobId, blobs.id))
        .where(and(eq(assets.id, assetId), eq(assets.noteId, noteId)));

    if (!source)
        throw new KnowledgeDomainError(
            'knowledge_not_found',
            'The audio source is unavailable.',
        );

    return source;
}

export async function transcriptionConfiguration(
    tx: KnowledgeTransaction,
    at: Date,
    deadlineAt: Date,
    sourceDurationMs: number,
    byteLength: number,
    credentialFingerprint?: string | null,
) {
    const [executor] = await tx
        .select({ id: workers.id })
        .from(workers)
        .where(
            and(
                eq(workers.providerId, 'openai'),
                eq(workers.modelId, 'gpt-transcribe'),
                eq(workers.adapterRevision, 'knowledge-transcription:v1'),
                eq(workers.status, 'available'),
                gt(workers.expiresAt, at),
                sql`${workers.textAiSupportedFormats} @> '["knowledge-transcription:v1"]'::jsonb`,
            ),
        )
        .limit(1);

    if (!executor)
        throw transcriptionUnavailable(
            'A compatible transcription executor is required.',
        );
    const [current] = await tx
        .select({ configuration: configs, price: prices })
        .from(state)
        .innerJoin(configs, eq(state.activeRevisionId, configs.id))
        .innerJoin(prices, eq(configs.providerPriceRevisionId, prices.id))
        .where(eq(state.id, 'global'))
        .for('share', { of: state });

    if (!current) throw transcriptionUnavailable();
    const c = current.configuration;
    const p = current.price;
    if (
        !isApprovedTranscriptionProcessingRevision(
            c.processingControlsRevision,
        ) ||
        !credentialFingerprint ||
        c.processingCredentialFingerprint !== credentialFingerprint ||
        !c.dataSharingDisabled ||
        !c.dataSharingEvidence ||
        !c.dataSharingAttestedAt ||
        c.dataSharingAttestedAt.getTime() +
            TRANSCRIPTION_DATA_SHARING_ATTESTATION_MS <=
            deadlineAt.getTime() ||
        !c.enabled ||
        !c.billingRulesVerified ||
        !c.billingEvidence ||
        c.creditsPerMinute === null ||
        c.maximumDurationMs < sourceDurationMs ||
        c.maximumBytes < byteLength ||
        p.providerId !== 'openai' ||
        p.modelId !== 'gpt-transcribe' ||
        p.meter !== 'audio-duration' ||
        p.effectiveAt > at
    )
        throw transcriptionUnavailable();
    const price = ProviderPriceSchema.parse({
        ...p.data,
        id: p.id,
        version: p.version,
        createdAt: p.createdAt.toISOString(),
        createdBy: p.createdBy,
        effectiveAt: p.effectiveAt.toISOString(),
    });

    if (
        !price.nativeRules ||
        !nativeProviderPricingMatchesMeter('audio-duration', price.nativeRules)
    )
        throw transcriptionUnavailable();
    const cost = evaluateNativeProviderCost(
        price.nativeRules,
        {
            endpointId: '/v1/audio/transcriptions',
            dispatchedAt: at.toISOString(),
            latestDispatchAt: new Date(deadlineAt.getTime() - 1).toISOString(),
        },
        { audioInputMilliseconds: sourceDurationMs, requests: 1 },
        'upper-bound',
    );

    if (
        cost.status !== 'calculated' ||
        cost.micros > BigInt(c.maximumProviderCostMicros)
    )
        throw transcriptionUnavailable(
            'A reviewed finite transcription spending bound is required.',
        );

    return { configuration: c, price, providerMaximumMicros: cost.micros };
}

export async function ownedTranscriptionJob(
    tx: KnowledgeTransaction,
    ownerId: string,
    noteId: string,
    id: string,
) {
    await lockKnowledgeOwner(tx, ownerId);
    const [row] = await tx
        .select()
        .from(jobs)
        .where(
            and(
                eq(jobs.id, id),
                eq(jobs.ownerId, ownerId),
                eq(jobs.noteId, noteId),
            ),
        )
        .for('update');

    if (!row)
        throw new KnowledgeDomainError(
            'knowledge_not_found',
            'The transcription is unavailable.',
        );

    return row;
}
