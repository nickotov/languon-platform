import { and, eq } from 'drizzle-orm';
import {
    KnowledgePrivateTranslationSchema,
    RequestKnowledgeTranslationSchema,
    TextSourceSchema,
    TextLanguageSchema,
    type TextSourceSegment,
} from '@languon/contracts';
import type {
    KnowledgePrivateTranslationStore,
    KnowledgeTranslationJobs,
    PrivateTranslationActor,
} from '../../../application/private-translation-store';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import {
    knowledgeUnavailable,
    type KnowledgeDatabase,
} from './knowledge-transaction';
import { pinKnowledgeLearningSource } from './learning-source-binding';
import {
    knowledgePrivateTranslationsTable as overlays,
    knowledgeTextJobSourcesTable as sources,
} from './private-translation-schema';

export class DrizzleKnowledgePrivateTranslationStore implements KnowledgePrivateTranslationStore {
    constructor(
        private readonly dependencies: {
            database: KnowledgeDatabase;
            crypto: KnowledgeShareCrypto;
            jobs: KnowledgeTranslationJobs;
            enabled?: boolean;
            now?: () => Date;
        },
    ) {}

    private async source(source: PrivateTranslationActor) {
        return this.dependencies.database.transaction(async (tx) => {
            const pinned = await pinKnowledgeLearningSource(
                tx,
                this.dependencies.crypto,
                source.actorId,
                source.noteId,
                source.blockId,
                source.access,
            );

            if (pinned.block.type !== 'bilingual-text')
                throw knowledgeUnavailable();

            return { ...pinned, block: pinned.block };
        });
    }

    list(source: PrivateTranslationActor) {
        return this.dependencies.database.transaction(async (tx) => {
            const pinned = await pinKnowledgeLearningSource(
                tx,
                this.dependencies.crypto,
                source.actorId,
                source.noteId,
                source.blockId,
                source.access,
            );

            if (pinned.block.type !== 'bilingual-text')
                throw knowledgeUnavailable();
            const rows = await tx
                .select()
                .from(overlays)
                .where(
                    and(
                        eq(overlays.actorId, source.actorId),
                        eq(overlays.noteId, source.noteId),
                        eq(overlays.blockId, source.blockId),
                        eq(
                            overlays.sourceFingerprint,
                            pinned.binding.sourceFingerprint,
                        ),
                    ),
                )
                .limit(16);

            return {
                translations: rows.map((row) =>
                    KnowledgePrivateTranslationSchema.parse({
                        noteId: row.noteId,
                        blockId: row.blockId,
                        sourceFingerprint: row.sourceFingerprint,
                        targetLanguage: row.targetLanguage,
                        segments: row.segments,
                        updatedAt: row.updatedAt.toISOString(),
                    }),
                ),
            };
        });
    }

    async request(
        source: PrivateTranslationActor,
        candidate: { operationId: string; targetLanguage: string },
        signal: AbortSignal,
        beforeAdmission?: () => Promise<void>,
    ) {
        signal.throwIfAborted();
        if (!this.dependencies.enabled)
            throw new KnowledgeDomainError(
                'service_unavailable',
                'Translation is unavailable.',
            );
        const input = RequestKnowledgeTranslationSchema.parse(candidate);
        const pinned = await this.source(source);
        if (
            pinned.block.language.toLowerCase() ===
            input.targetLanguage.toLowerCase()
        )
            throw new KnowledgeDomainError(
                'invalid_request',
                'The original is already in the selected language.',
            );
        if (
            pinned.block.translations.some(
                (translation) =>
                    translation.language.toLowerCase() ===
                    input.targetLanguage.toLowerCase(),
            )
        )
            throw new KnowledgeDomainError(
                'invalid_request',
                'This language already has a prepared translation. Use the shared bilingual view.',
            );
        const sourceLanguage = TextLanguageSchema.safeParse(
            pinned.block.language,
        );

        if (!sourceLanguage.success)
            throw new KnowledgeDomainError(
                'invalid_request',
                'This text language is not supported for translation.',
            );
        const sourceText = pinned.block.segments
            .map((segment) => segment.text)
            .join('\n\n');

        if (!TextSourceSchema.safeParse(sourceText).success)
            throw new KnowledgeDomainError(
                'invalid_request',
                'This text is too long for one translation. Split it into smaller blocks.',
            );
        let offset = 0;
        const segments: TextSourceSegment[] = pinned.block.segments.map(
            (segment, index) => {
                const text = index === 0 ? segment.text : `\n\n${segment.text}`;
                const startOffset = offset;
                offset += text.length;

                return {
                    pairId: segment.id,
                    text,
                    startOffset,
                    endOffset: offset,
                    paragraphIndex: index,
                };
            },
        );

        await beforeAdmission?.();
        signal.throwIfAborted();

        return {
            job: await this.dependencies.jobs.enqueueKnowledgeTranslation(
                source.actorId,
                {
                    operationId: input.operationId,
                    folderId: null,
                    sourceText,
                    sourceLanguage: TextLanguageSchema.parse(
                        pinned.block.language,
                    ),
                    targetLanguage: input.targetLanguage,
                },
                segments,
                pinned.binding,
                { now: this.dependencies.now?.() ?? new Date(), signal },
            ),
        };
    }

    private async matchedJob(source: PrivateTranslationActor, jobId: string) {
        await this.source(source);
        const [job] = await this.dependencies.database
            .select({ id: sources.jobId })
            .from(sources)
            .where(
                and(
                    eq(sources.jobId, jobId),
                    eq(sources.actorId, source.actorId),
                    eq(sources.noteId, source.noteId),
                    eq(sources.blockId, source.blockId),
                ),
            );

        if (!job) throw knowledgeUnavailable();
    }

    async job(
        source: PrivateTranslationActor,
        jobId: string,
        signal: AbortSignal,
    ) {
        await this.matchedJob(source, jobId);

        return {
            job: await this.dependencies.jobs.get(source.actorId, jobId, {
                now: this.dependencies.now?.() ?? new Date(),
                signal,
            }),
        };
    }

    async cancel(
        source: PrivateTranslationActor,
        jobId: string,
        signal: AbortSignal,
    ) {
        await this.matchedJob(source, jobId);

        return {
            job: await this.dependencies.jobs.cancel(source.actorId, jobId, {
                now: this.dependencies.now?.() ?? new Date(),
                signal,
            }),
        };
    }
}
