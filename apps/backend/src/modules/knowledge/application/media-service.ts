import {
    KnowledgeMediaAccessSchema,
    KnowledgeMediaParamsSchema,
    type KnowledgeMediaAccess,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeDomainError } from '../domain/knowledge';
import type { KnowledgeRequestContext } from './knowledge-service';
import type {
    KnowledgeMediaStore,
    VerifiedKnowledgeAudio,
} from './media-store';

export class KnowledgeMediaService {
    constructor(
        private readonly dependencies: {
            store: KnowledgeMediaStore;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
            verify(bytes: Uint8Array, mime: string): VerifiedKnowledgeAudio;
            readSpeech?: (
                actorId: string,
                playbackId: string,
                signal: AbortSignal,
            ) => Promise<{
                text: string;
                language: string;
                audio: {
                    bytes: Uint8Array;
                    mimeType: 'audio/wav' | 'audio/mpeg';
                };
            }>;
        },
    ) {}
    async importSpeech(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        playbackId: string,
    ) {
        await this.rate(context, context.clientAddress, 30);
        const principal = await this.dependencies.authenticate(token);
        const validatedNoteId =
            KnowledgeMediaParamsSchema.shape.noteId.parse(noteId);
        const validatedPlaybackId =
            KnowledgeMediaParamsSchema.shape.assetId.parse(playbackId);
        if (!this.dependencies.readSpeech)
            throw new KnowledgeDomainError(
                'service_unavailable',
                'Speech is unavailable.',
            );
        const { audio, text, language } = await this.dependencies.readSpeech(
            principal.userId,
            validatedPlaybackId,
            context.signal,
        );
        const asset = await this.dependencies.store.upload(
            principal.userId,
            validatedNoteId,
            this.dependencies.verify(audio.bytes, audio.mimeType),
        );
        return { asset, sourceText: text, language };
    }
    private async rate(
        context: KnowledgeRequestContext,
        subject: string,
        limit: number,
    ) {
        context.signal.throwIfAborted();
        const result = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-media',
            subject,
            limit,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!result.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many audio requests.',
            );
    }
    async upload(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        bytes: Uint8Array,
        mime: string,
    ) {
        await this.rate(context, context.clientAddress, 30);
        const principal = await this.dependencies.authenticate(token);
        await this.rate(context, principal.userId, 15);
        const ids = KnowledgeMediaParamsSchema.shape.noteId.parse(noteId);
        const audio = this.dependencies.verify(bytes, mime);
        context.signal.throwIfAborted();
        return this.dependencies.store.upload(principal.userId, ids, audio);
    }
    async read(
        context: KnowledgeRequestContext,
        noteId: string,
        assetId: string,
        token?: string,
        access?: KnowledgeMediaAccess,
    ) {
        await this.rate(context, context.clientAddress, 180);
        const ids = KnowledgeMediaParamsSchema.parse({ noteId, assetId });
        const principal = token
            ? await this.dependencies.authenticate(token)
            : undefined;
        return this.dependencies.store.read(ids.noteId, ids.assetId, {
            ...(principal ? { ownerId: principal.userId } : {}),
            ...(access
                ? { access: KnowledgeMediaAccessSchema.parse(access) }
                : {}),
        });
    }
}
